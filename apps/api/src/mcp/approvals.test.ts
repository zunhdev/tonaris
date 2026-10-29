// The write tools and the verifiable approval round trip (TS-62–TS-64, FR-10.4, FR-10.6) against the real app:
// an ordinary batch with a partial failure, then `delete_albums` asking for approval, the owner deciding on the
// API the approval page uses, and the operation running only for the approved, unused, unexpired scope.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { Client } from "@modelcontextprotocol/client";
import { z } from "zod";

import { albums, approvals, trashUnits } from "@tonaris/db";

import { createTestApp } from "../testing";
import { mcpHarness } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

const { registerClient, connect, mcpClient, insertAlbum, insertList } = mcpHarness(() => t);

/** A Manage collection connection for anna, with two albums in one list. */
async function manageSetup() {
  const clientId = await registerClient();
  const { userId, cookie, tokens } = await connect("anna@example.com", clientId, "manage");
  const first = await insertAlbum(userId, "Homogenic", "Björk", 1997);
  const second = await insertAlbum(userId, "Vespertine", "Björk", 2001);
  const listId = await insertList(userId, "Favourites", [first, second]);
  const mcp = await mcpClient(tokens.access_token);
  return { clientId, userId, cookie, tokens, first, second, listId, mcp };
}

const needsApproval = z.object({
  status: z.literal("needs_approval"),
  approvalId: z.uuid(),
  url: z.string(),
  summary: z.string(),
  consequences: z.array(z.string()),
  expiresAt: z.string(),
  note: z.string().optional(),
  unavailable: z.array(z.string()),
});

async function call(mcp: Client, name: string, args: Record<string, unknown>) {
  const result = await mcp.callTool({ name, arguments: args });
  return { isError: result.isError === true, content: result.structuredContent };
}

async function requestDeletion(mcp: Client, albumIds: string[], approvalId?: string) {
  const { content } = await call(mcp, "delete_albums", {
    albumIds,
    ...(approvalId ? { approvalId } : {}),
  });
  return content;
}

function decide(cookie: string, approvalId: string, decision: "approve" | "decline") {
  return t.call(`/v1/approvals/${approvalId}/decision`, {
    headers: { cookie },
    json: { decision },
  });
}

async function trashedIds(): Promise<string[]> {
  const rows = await t.db.select({ id: albums.id, trashedAt: albums.trashedAt }).from(albums);
  return rows.filter((row) => row.trashedAt).map((row) => row.id);
}

describe("write tools (FR-10.4, TS-62)", () => {
  test("a Manage connection is offered the write tools, marked as writes", async () => {
    const { mcp } = await manageSetup();
    const { tools } = await mcp.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get("add_to_lists")?.annotations).toMatchObject({ readOnlyHint: false });
    expect(byName.get("delete_albums")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  test("a Read-only connection can't call them, even by name", async () => {
    const clientId = await registerClient();
    const { userId, tokens } = await connect("anna@example.com", clientId, "read_only");
    const album = await insertAlbum(userId, "Homogenic", "Björk", 1997);
    const mcp = await mcpClient(tokens.access_token);
    // The tool isn't there for this connection, so the call is a protocol error, not a tool result.
    const refused: unknown = await mcp
      .callTool({ name: "delete_albums", arguments: { albumIds: [album] } })
      .catch((error: unknown) => error);
    expect(String(refused)).toContain("Tool delete_albums not found");
    expect(await trashedIds()).toEqual([]);
  });
});

describe("the approval round trip (TS-64, FR-10.6)", () => {
  test("delete_albums asks for approval with the exact scope, and changes nothing yet", async () => {
    const { first, second, listId, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [second, first]));
    expect(asked.url).toBe(`${t.config.webOrigin}/approvals/${asked.approvalId}`);
    expect(asked.summary).toBe("Move 2 albums to Trash");
    expect(asked.consequences).toEqual([
      "They leave 1 list and Unsorted.",
      "They can be recovered from Trash for 30 days.",
    ]);
    expect(await trashedIds()).toEqual([]);

    const [stored] = await t.db.select().from(approvals);
    expect(stored).toMatchObject({ status: "pending", operation: "delete_albums" });
    expect(stored?.scope.albums.map((album) => album.lists)).toEqual([
      [{ id: listId, name: "Favourites" }],
      [{ id: listId, name: "Favourites" }],
    ]);
    expect((stored?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(29 * 60_000);
  });

  test("calling again before the owner decides still waits; claiming approval changes nothing", async () => {
    const { first, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    const again = needsApproval.parse(await requestDeletion(mcp, [first], asked.approvalId));
    expect(again).toMatchObject({
      approvalId: asked.approvalId,
      note: "The owner hasn't decided yet.",
    });
    expect(await trashedIds()).toEqual([]);
  });

  test("once approved, the call with the approval moves the albums to Trash, once", async () => {
    const { first, second, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first, second]));
    const decided = await decide(cookie, asked.approvalId, "approve");
    expect(decided.status).toBe(200);
    expect(await decided.json()).toMatchObject({ state: "approved" });

    expect(await requestDeletion(mcp, [first, second], asked.approvalId)).toEqual({
      status: "confirmed",
      trashed: [first, second].toSorted(),
      unavailable: [],
    });
    expect((await trashedIds()).toSorted()).toEqual([first, second].toSorted());
    const units = await t.db.select().from(trashUnits);
    expect(units.map((unit) => unit.kind)).toEqual(["album", "album"]);

    // Single-use: the same approval can't run a second time.
    expect(await requestDeletion(mcp, [first, second], asked.approvalId)).toMatchObject({
      status: "failed",
      code: "not_found",
    });
    const status = await call(mcp, "get_approval", { approvalId: asked.approvalId });
    expect(status.content).toMatchObject({ state: "used" });
  });

  test("an album that joined another list after the approval needs a new approval", async () => {
    const { userId, first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    await decide(cookie, asked.approvalId, "approve");
    const other = await insertList(userId, "Late night");
    await call(mcp, "add_to_lists", { listIds: [other], albumIds: [first] });

    const fresh = needsApproval.parse(await requestDeletion(mcp, [first], asked.approvalId));
    expect(fresh.approvalId).not.toBe(asked.approvalId);
    expect(fresh.note).toBe(
      "What this deletes changed since it was approved, so it needs a new approval.",
    );
    expect(fresh.consequences[0]).toBe("They leave 2 lists and Unsorted.");
    expect(await trashedIds()).toEqual([]);
    // The earlier approval is still unused; only the new scope can be approved now.
    const earlier = await call(mcp, "get_approval", { approvalId: asked.approvalId });
    expect(earlier.content).toMatchObject({ state: "approved" });
  });

  test("an approval covers only its albums", async () => {
    const { first, second, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    await decide(cookie, asked.approvalId, "approve");
    const wider = needsApproval.parse(
      await requestDeletion(mcp, [first, second], asked.approvalId),
    );
    expect(wider.approvalId).not.toBe(asked.approvalId);
    expect(wider.summary).toBe("Move 2 albums to Trash");
    expect(await trashedIds()).toEqual([]);
  });

  test("declining changes nothing, and the decision stands", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    expect(await (await decide(cookie, asked.approvalId, "decline")).json()).toMatchObject({
      state: "declined",
    });
    expect(await requestDeletion(mcp, [first], asked.approvalId)).toEqual({ status: "declined" });
    // Deciding again keeps the first decision.
    expect(await (await decide(cookie, asked.approvalId, "approve")).json()).toMatchObject({
      state: "declined",
    });
    expect(await trashedIds()).toEqual([]);
  });

  test("an expired approval can't be decided or used; calling again asks anew", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    await decide(cookie, asked.approvalId, "approve");
    await t.db.$client`update approvals set expires_at = now() - interval '1 second'`;

    const decided = await decide(cookie, asked.approvalId, "decline");
    expect(decided.status).toBe(410);
    expect(await decided.json()).toMatchObject({ code: "expired" });
    const fresh = needsApproval.parse(await requestDeletion(mcp, [first], asked.approvalId));
    expect(fresh).toMatchObject({ note: "The earlier approval expired." });
    expect(fresh.approvalId).not.toBe(asked.approvalId);
    expect(await trashedIds()).toEqual([]);
  });

  test("another connection of the same person can't use the approval", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    await decide(cookie, asked.approvalId, "approve");
    const second = await connect("anna@example.com", await registerClient("Other"), "manage");
    const other = await mcpClient(second.tokens.access_token);

    expect(await requestDeletion(other, [first], asked.approvalId)).toMatchObject({
      status: "failed",
      code: "not_found",
    });
    expect((await call(other, "get_approval", { approvalId: asked.approvalId })).isError).toBe(
      true,
    );
    expect(await trashedIds()).toEqual([]);
  });

  test("only the owner sees or decides the request; another account gets a 403", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    const own = await t.call(`/v1/approvals/${asked.approvalId}`, { headers: { cookie } });
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({
      state: "pending",
      clientName: "Test client",
      summary: "Move 1 album to Trash",
      scope: { albums: [{ id: first, title: "Homogenic", artist: "Björk" }] },
    });

    const ben = await t.signIn("ben@example.com");
    const seen = await t.call(`/v1/approvals/${asked.approvalId}`, {
      headers: { cookie: ben.cookie },
    });
    expect(seen.status).toBe(403);
    expect(await seen.json()).toMatchObject({
      code: "permission_denied",
      detail: "This request belongs to another account.",
    });
    expect((await decide(ben.cookie, asked.approvalId, "approve")).status).toBe(403);
    expect(
      (await t.call(`/v1/approvals/${Bun.randomUUIDv7()}`, { headers: { cookie } })).status,
    ).toBe(404);
  });

  test("revoking the connection removes its approvals", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first]));
    const [connection] = z
      .array(z.object({ id: z.string() }))
      .parse(await (await t.call("/v1/connections", { headers: { cookie } })).json());
    await t.call(`/v1/connections/${connection?.id}`, { method: "DELETE", headers: { cookie } });
    const gone = await t.call(`/v1/approvals/${asked.approvalId}`, { headers: { cookie } });
    expect(gone.status).toBe(404);
  });

  test("albums already in Trash or unknown are reported, and the rest still need approval", async () => {
    const { first, mcp } = await manageSetup();
    const missing = Bun.randomUUIDv7();
    const asked = needsApproval.parse(await requestDeletion(mcp, [first, missing]));
    expect(asked.unavailable).toEqual([missing]);
    expect(asked.summary).toBe("Move 1 album to Trash");
    expect(await requestDeletion(mcp, [missing])).toMatchObject({
      status: "failed",
      code: "not_found",
    });
  });
});
