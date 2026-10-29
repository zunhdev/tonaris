// The gated tools and the verifiable approval round trip (TS-63, TS-64, FR-10.6) against the real app: a gated tool
// asks for approval with the exact scope, the owner decides on the API the approval page uses, and the operation runs
// the app's own commands only for the approved, unused, unexpired scope, in the transaction that uses the approval.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { Client } from "@modelcontextprotocol/client";
import { z } from "zod";

import { albums, approvals, containers, trashUnits } from "@tonaris/db";
import { uuidv7 } from "@tonaris/domain";

import { fixtureCapture, fixtureLinks } from "../capture-fixtures";
import { createTestApp } from "../testing";
import { mcpHarness } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp({ capture: fixtureCapture() });
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
});

const ran = z.object({
  status: z.literal("ran"),
  idempotencyKey: z.string(),
  items: z.array(z.looseObject({ outcome: z.looseObject({ status: z.string() }) })),
});

async function call(mcp: Client, name: string, args: Record<string, unknown>) {
  const result = await mcp.callTool({ name, arguments: args });
  return { isError: result.isError === true, content: result.structuredContent };
}

async function requestDeletion(
  mcp: Client,
  ids: { albumIds?: string[]; containerIds?: string[] },
  approvalId?: string,
  idempotencyKey?: string,
) {
  const { content } = await call(mcp, "delete_items", {
    ...ids,
    ...(approvalId ? { approvalId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
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

/** Runs an app mutation as `cookie`, which must be confirmed. */
async function send(cookie: string, name: string, args: unknown, base?: unknown) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), name, args, ...(base === undefined ? {} : { base }) },
    headers: { cookie },
  });
  expect(await response.json()).toMatchObject({ outcome: { status: "confirmed" } });
}

describe("gated tools (FR-10.6, TS-62)", () => {
  test("a Manage connection is offered them, marked destructive", async () => {
    const { mcp } = await manageSetup();
    const { tools } = await mcp.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    for (const name of ["delete_items", "delete_field", "remove_options"]) {
      expect(byName.get(name)?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });
    }
    expect(byName.get("confirm_match")?.annotations).toMatchObject({ readOnlyHint: false });
    expect(byName.has("delete_albums")).toBe(false);
  });

  test("a Read-only connection can't call them, even by name", async () => {
    const clientId = await registerClient();
    const { userId, tokens } = await connect("anna@example.com", clientId, "read_only");
    const album = await insertAlbum(userId, "Homogenic", "Björk", 1997);
    const mcp = await mcpClient(tokens.access_token);
    // The tool isn't there for this connection, so the call is a protocol error, not a tool result.
    const refused: unknown = await mcp
      .callTool({ name: "delete_items", arguments: { albumIds: [album] } })
      .catch((error: unknown) => error);
    expect(String(refused)).toContain("Tool delete_items not found");
    expect(await trashedIds()).toEqual([]);
  });
});

describe("the approval round trip (TS-64, FR-10.6)", () => {
  test("delete_items asks for approval with the exact scope, and changes nothing yet", async () => {
    const { first, second, listId, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [second, first] }));
    expect(asked.url).toBe(`${t.config.webOrigin}/approvals/${asked.approvalId}`);
    expect(asked.summary).toBe("Move 2 albums to Trash");
    expect(asked.consequences).toEqual([
      "They leave 1 list and Unsorted.",
      "They can be recovered from Trash for 30 days.",
    ]);
    expect(await trashedIds()).toEqual([]);

    const [stored] = await t.db.select().from(approvals);
    expect(stored).toMatchObject({ status: "pending", operation: "delete_items" });
    expect(stored?.scope.albums.map((album) => album.lists)).toEqual([
      [{ id: listId, name: "Favourites" }],
      [{ id: listId, name: "Favourites" }],
    ]);
    expect((stored?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(29 * 60_000);
  });

  test("calling again before the owner decides still waits; claiming approval changes nothing", async () => {
    const { first, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    const again = needsApproval.parse(
      await requestDeletion(mcp, { albumIds: [first] }, asked.approvalId),
    );
    expect(again).toMatchObject({
      approvalId: asked.approvalId,
      note: "The owner hasn't decided yet.",
    });
    expect(await trashedIds()).toEqual([]);
  });

  test("once approved, the call moves the albums to Trash with the app's command, once", async () => {
    const { first, second, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first, second] }));
    const decided = await decide(cookie, asked.approvalId, "approve");
    expect(decided.status).toBe(200);
    expect(await decided.json()).toMatchObject({ state: "approved" });

    const done = ran.parse(
      await requestDeletion(mcp, { albumIds: [first, second] }, asked.approvalId, "delete-1"),
    );
    expect(done.items).toEqual(
      [first, second].toSorted().map((albumId) => ({ albumId, outcome: { status: "confirmed" } })),
    );
    expect((await trashedIds()).toSorted()).toEqual([first, second].toSorted());
    const units = await t.db.select().from(trashUnits);
    expect(units.map((unit) => unit.kind)).toEqual(["album", "album"]);

    // Sending the same key again replays the change; nothing runs twice.
    expect(
      ran.parse(
        await requestDeletion(mcp, { albumIds: [first, second] }, asked.approvalId, "delete-1"),
      ),
    ).toEqual(done);
    // A new change can't use the approval again.
    expect(
      await requestDeletion(mcp, { albumIds: [first, second] }, asked.approvalId),
    ).toMatchObject({
      status: "failed",
      code: "expired",
    });
    const status = await call(mcp, "get_approval", { approvalId: asked.approvalId });
    expect(status.content).toMatchObject({ state: "used" });
  });

  test("an album that joined another list after the approval needs a new approval", async () => {
    const { userId, first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    await decide(cookie, asked.approvalId, "approve");
    const other = await insertList(userId, "Late night");
    await call(mcp, "add_to_lists", { listIds: [other], albumIds: [first] });

    const fresh = needsApproval.parse(
      await requestDeletion(mcp, { albumIds: [first] }, asked.approvalId),
    );
    expect(fresh.approvalId).not.toBe(asked.approvalId);
    expect(fresh.note).toBe(
      "What this does changed since it was approved, so it needs a new approval.",
    );
    expect(fresh.consequences[0]).toBe("They leave 2 lists and Unsorted.");
    expect(await trashedIds()).toEqual([]);
    // The earlier approval is still unused; only the new scope can be approved now.
    const earlier = await call(mcp, "get_approval", { approvalId: asked.approvalId });
    expect(earlier.content).toMatchObject({ state: "approved" });
  });

  test("an approval covers only its albums", async () => {
    const { first, second, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    await decide(cookie, asked.approvalId, "approve");
    const wider = needsApproval.parse(
      await requestDeletion(mcp, { albumIds: [first, second] }, asked.approvalId),
    );
    expect(wider.approvalId).not.toBe(asked.approvalId);
    expect(wider.summary).toBe("Move 2 albums to Trash");
    expect(await trashedIds()).toEqual([]);
  });

  test("declining changes nothing, and the decision stands", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    expect(await (await decide(cookie, asked.approvalId, "decline")).json()).toMatchObject({
      state: "declined",
    });
    expect(await requestDeletion(mcp, { albumIds: [first] }, asked.approvalId)).toEqual({
      status: "declined",
    });
    // Deciding again keeps the first decision.
    expect(await (await decide(cookie, asked.approvalId, "approve")).json()).toMatchObject({
      state: "declined",
    });
    expect(await trashedIds()).toEqual([]);
  });

  test("an expired approval can't be decided or used; calling again asks anew", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    await decide(cookie, asked.approvalId, "approve");
    await t.db.$client`update approvals set expires_at = now() - interval '1 second'`;

    const decided = await decide(cookie, asked.approvalId, "decline");
    expect(decided.status).toBe(410);
    expect(await decided.json()).toMatchObject({ code: "expired" });
    const fresh = needsApproval.parse(
      await requestDeletion(mcp, { albumIds: [first] }, asked.approvalId),
    );
    expect(fresh).toMatchObject({ note: "The earlier approval expired." });
    expect(fresh.approvalId).not.toBe(asked.approvalId);
    expect(await trashedIds()).toEqual([]);
  });

  test("another connection of the same person, or another operation, can't use the approval", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    await decide(cookie, asked.approvalId, "approve");
    const second = await connect("anna@example.com", await registerClient("Other"), "manage");
    const other = await mcpClient(second.tokens.access_token);

    expect(await requestDeletion(other, { albumIds: [first] }, asked.approvalId)).toMatchObject({
      code: "not_found",
    });
    expect((await call(other, "get_approval", { approvalId: asked.approvalId })).isError).toBe(
      true,
    );
    const field = await call(mcp, "delete_field", {
      fieldId: Bun.randomUUIDv7(),
      approvalId: asked.approvalId,
    });
    expect(field.content).toMatchObject({ code: "not_found" });
    expect(await trashedIds()).toEqual([]);
  });

  test("only the owner sees or decides the request; another account gets a 403", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    const own = await t.call(`/v1/approvals/${asked.approvalId}`, { headers: { cookie } });
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({
      state: "pending",
      clientName: "Test client",
      summary: "Move 1 album to Trash",
      scope: { albums: [{ id: first, title: "Homogenic", artist: "Björk" }] },
    });
    const pending = await t.call("/v1/approvals", { headers: { cookie } });
    expect(await pending.json()).toMatchObject({
      approvals: [
        { id: asked.approvalId, clientName: "Test client", summary: "Move 1 album to Trash" },
      ],
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
      await (await t.call("/v1/approvals", { headers: { cookie: ben.cookie } })).json(),
    ).toEqual({ approvals: [] });
    expect(
      (await t.call(`/v1/approvals/${Bun.randomUUIDv7()}`, { headers: { cookie } })).status,
    ).toBe(404);
  });

  test("revoking the connection removes its approvals", async () => {
    const { first, cookie, mcp } = await manageSetup();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first] }));
    const [connection] = z
      .array(z.object({ id: z.string() }))
      .parse(await (await t.call("/v1/connections", { headers: { cookie } })).json());
    await t.call(`/v1/connections/${connection?.id}`, { method: "DELETE", headers: { cookie } });
    const gone = await t.call(`/v1/approvals/${asked.approvalId}`, { headers: { cookie } });
    expect(gone.status).toBe(404);
  });

  test("the scope names only what's in the collection; nothing of it is not_found", async () => {
    const { first, mcp } = await manageSetup();
    const missing = Bun.randomUUIDv7();
    const asked = needsApproval.parse(await requestDeletion(mcp, { albumIds: [first, missing] }));
    expect(asked.summary).toBe("Move 1 album to Trash");
    expect(await requestDeletion(mcp, { albumIds: [missing] })).toMatchObject({
      code: "not_found",
    });
  });
});

describe("deleting folders and lists (FR-01.11, FR-07.14)", () => {
  test("names what goes, the albums left for Unsorted and who no longer sees it; then deletes as one unit", async () => {
    const { userId, first, second, cookie, mcp } = await manageSetup();
    const folder = Bun.randomUUIDv7();
    const [inner, kept] = [Bun.randomUUIDv7(), Bun.randomUUIDv7()];
    await send(cookie, "account.setDisplayName", { displayName: "Anna" });
    await send(cookie, "container.create", {
      id: folder,
      kind: "folder",
      parentId: null,
      name: "Metal",
    });
    await send(cookie, "container.create", {
      id: inner,
      kind: "list",
      parentId: folder,
      name: "Doom",
    });
    await send(cookie, "container.create", {
      id: kept,
      kind: "list",
      parentId: null,
      name: "Kept",
    });
    await send(cookie, "membership.add", { listId: inner, albumId: first });
    await send(cookie, "membership.add", { listId: inner, albumId: second });
    await send(cookie, "membership.add", { listId: kept, albumId: second });
    const only = await insertAlbum(userId, "Only here", "Band", 2000);
    await send(cookie, "membership.add", { listId: inner, albumId: only });
    await send(cookie, "share.setLink", { containerId: folder, enabled: true, linkId: uuidv7() });

    // The inner list goes with its folder, so it isn't named twice.
    const asked = needsApproval.parse(
      await requestDeletion(mcp, { containerIds: [inner, folder] }),
    );
    expect(asked.summary).toBe("Move 1 folder (1 list inside) to Trash");
    expect(asked.consequences).toEqual([
      "Albums in them stay in the collection: 1 album is in no other list, so go to Unsorted.",
      "Anyone with its link will no longer see it.",
      "Everything can be recovered from Trash for 30 days.",
    ]);
    // "Homogenic" is in "Favourites" too, and "Vespertine" in "Kept": only "Only here" goes to Unsorted.
    await decide(cookie, asked.approvalId, "approve");
    const done = ran.parse(
      await requestDeletion(mcp, { containerIds: [inner, folder] }, asked.approvalId),
    );
    expect(done.items).toEqual([{ containerId: folder, outcome: { status: "confirmed" } }]);
    const units = await t.db
      .select({ kind: trashUnits.kind, rootId: trashUnits.rootId })
      .from(trashUnits);
    expect(units).toEqual([{ kind: "folder", rootId: folder }]);
    const gone = await t.db
      .select({ id: containers.id, trashedAt: containers.trashedAt })
      .from(containers);
    expect(
      gone
        .filter((row) => row.trashedAt)
        .map((row) => row.id)
        .toSorted(),
    ).toEqual([folder, inner].toSorted());
    expect(await trashedIds()).toEqual([]);
  });
});

/** A Manage connection with a choice field, its first option chosen on the first album. */
async function fieldSetup() {
  const setup = await manageSetup();
  const made = await call(setup.mcp, "create_field", {
    name: "Format",
    type: "single_choice",
    options: ["Vinyl", "CD", "Tape"],
  });
  const field = z
    .object({
      items: z.tuple([
        z.object({ fieldId: z.string(), options: z.array(z.object({ id: z.string() })) }),
      ]),
    })
    .parse(made.content).items[0];
  const [vinyl, cd, tape] = field.options.map((option) => option.id);
  await call(setup.mcp, "set_album_fields", {
    changes: [{ albumId: setup.first, fieldId: field.fieldId, action: "set", value: vinyl }],
  });
  return { ...setup, fieldId: field.fieldId, vinyl, cd, tape };
}

describe("fields and options (FR-03.17, FR-03.18)", () => {
  test("deleting a field always asks, and runs once approved", async () => {
    const { fieldId, cookie, mcp } = await fieldSetup();
    const asked = needsApproval.parse((await call(mcp, "delete_field", { fieldId })).content);
    expect(asked.summary).toBe('Delete the field "Format" for good');
    expect(asked.consequences).toEqual([
      "It is taken off 1 album, with its values.",
      "This can't be undone.",
    ]);
    await decide(cookie, asked.approvalId, "approve");
    const done = ran.parse(
      (await call(mcp, "delete_field", { fieldId, approvalId: asked.approvalId })).content,
    );
    expect(done.items).toEqual([{ fieldId, outcome: { status: "confirmed" } }]);
    expect(
      await (
        await mcp.callTool({ name: "list_fields", arguments: {} })
      ).structuredContent,
    ).toEqual({ fields: [], limit: 50 });
  });

  test("unused options go at once; a chosen one asks, and an option chosen since asks again", async () => {
    const { first, second, fieldId, vinyl, cd, tape, cookie, mcp } = await fieldSetup();
    const unused = await call(mcp, "remove_options", { fieldId, optionIds: [tape] });
    expect(ran.parse(unused.content).items).toEqual([
      { optionId: tape, outcome: { status: "confirmed" } },
    ]);

    const asked = needsApproval.parse(
      (await call(mcp, "remove_options", { fieldId, optionIds: [vinyl, cd] })).content,
    );
    expect(asked.summary).toBe('Remove 2 options from "Format"');
    expect(asked.consequences).toEqual(["They are cleared from 1 album.", "This can't be undone."]);
    await decide(cookie, asked.approvalId, "approve");
    // CD becomes chosen after the approval: the scope grew.
    await call(mcp, "set_album_fields", {
      changes: [{ albumId: second, fieldId, action: "set", value: cd }],
    });
    const fresh = needsApproval.parse(
      (
        await call(mcp, "remove_options", {
          fieldId,
          optionIds: [vinyl, cd],
          approvalId: asked.approvalId,
        })
      ).content,
    );
    expect(fresh.consequences[0]).toBe("They are cleared from 2 albums.");
    await decide(cookie, fresh.approvalId, "approve");
    const done = ran.parse(
      (
        await call(mcp, "remove_options", {
          fieldId,
          optionIds: [vinyl, cd],
          approvalId: fresh.approvalId,
        })
      ).content,
    );
    expect(done.items.map((item) => item.outcome.status)).toEqual(["confirmed", "confirmed"]);
    expect(
      await (
        await mcp.callTool({ name: "get_album", arguments: { albumId: first } })
      ).structuredContent,
    ).toMatchObject({ fields: [{ name: "Format", value: null }] });
  });
});

describe("confirming a match (FR-02.9, FR-02.10)", () => {
  test("a link fitting several albums waits for the owner's choice, then is added as approved", async () => {
    const { cookie, listId, mcp } = await manageSetup();
    const offered = await call(mcp, "add_albums", {
      items: [{ link: fixtureLinks.ambiguousApple }],
    });
    const outcome = z
      .object({
        items: z.tuple([
          z.object({
            outcome: z.object({
              status: z.literal("needs_input"),
              need: z.literal("match"),
              candidates: z.array(z.object({ releaseGroupId: z.string(), title: z.string() })),
            }),
          }),
        ]),
      })
      .parse(offered.content).items[0].outcome;
    const [choice] = outcome.candidates;
    expect(choice).toBeDefined();

    // A releaseGroupId the link doesn't offer is refused.
    const wrong = await call(mcp, "confirm_match", {
      link: fixtureLinks.ambiguousApple,
      releaseGroupId: Bun.randomUUIDv7(),
    });
    expect(wrong.isError).toBe(true);

    const asked = needsApproval.parse(
      (
        await call(mcp, "confirm_match", {
          link: fixtureLinks.ambiguousApple,
          releaseGroupId: choice?.releaseGroupId,
          listId,
        })
      ).content,
    );
    expect(asked.summary).toBe(`Add "${choice?.title}" from this link`);
    expect(asked.consequences).toEqual([
      "It is saved as a new album with this link.",
      'It goes in the list "Favourites".',
    ]);
    const before = await t.db.select({ id: albums.id }).from(albums);
    await decide(cookie, asked.approvalId, "approve");
    const done = ran.parse(
      (
        await call(mcp, "confirm_match", {
          link: fixtureLinks.ambiguousApple,
          releaseGroupId: choice?.releaseGroupId,
          listId,
          approvalId: asked.approvalId,
        })
      ).content,
    );
    expect(done.items[0]?.outcome.status).toBe("confirmed");
    expect((await t.db.select({ id: albums.id }).from(albums)).length).toBe(before.length + 1);
  });
});
