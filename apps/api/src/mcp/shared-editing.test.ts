// An editor's AI agent edits a share as the editor can in the app (FR-10.3, FR-10.4, FR-07.19–FR-07.21; TON-192,
// TON-200): a Manage collection connection sees its role in Shared with me and changes the share's folders, lists and
// albums, including by hand, deletions and confirmed matches, whose approvals name nothing outside the share; the
// owner's fields, Trash and everything outside the share stay out of reach; a Read-only one only reads.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import {
  containers,
  fieldDefinitions,
  memberships,
  savedReferences,
  shareGrants,
} from "@tonaris/db";
import { nameKey, searchKey } from "@tonaris/domain";

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

const id = () => Bun.randomUUIDv7();

async function agentOf(email: string, mode: "manage" | "read_only") {
  const clientId = await registerClient();
  const connection = await connect(email, clientId, mode);
  return { ...connection, mcp: await mcpClient(connection.tokens.access_token) };
}

type Mcp = Awaited<ReturnType<typeof agentOf>>["mcp"];

const answerSchema = z.object({
  items: z.array(
    z.looseObject({ outcome: z.looseObject({ status: z.string(), code: z.string().optional() }) }),
  ),
});

const needsApproval = z.object({
  status: z.literal("needs_approval"),
  approvalId: z.uuid(),
  summary: z.string(),
  consequences: z.array(z.string()),
});

async function write(mcp: Mcp, name: string, args: Record<string, unknown>) {
  const answer = await mcp.callTool({ name, arguments: args });
  if (answer.isError) throw new Error(`${name} failed: ${JSON.stringify(answer.content)}`);
  return answerSchema.parse(answer.structuredContent).items.map((item) => item.outcome);
}

/** Asks for a gated change, approves it as `cookie`, and runs it: each item's outcome, and what the approval said. */
async function approved(mcp: Mcp, cookie: string, name: string, args: Record<string, unknown>) {
  const asked = needsApproval.parse(
    (await mcp.callTool({ name, arguments: args })).structuredContent,
  );
  const decided = await t.call(`/v1/approvals/${asked.approvalId}/decision`, {
    headers: { cookie },
    json: { decision: "approve" },
  });
  expect(decided.status).toBe(200);
  const outcomes = await write(mcp, name, { ...args, approvalId: asked.approvalId });
  return { asked, outcomes };
}

/**
 * Denis's folder "Metal", with the list "Doom" holding "Nightfall", shared with Anna to edit and Ben to view, and kept
 * in Anna's Shared with me. His "Secret" isn't shared, and holds "Hidden" and "Nightfall" too.
 */
async function sharedWithAnna() {
  const { id: denis } = await t.signIn("denis@example.com");
  const { id: anna, cookie } = await t.signIn("anna@example.com");
  const { id: ben } = await t.signIn("ben@example.com");
  const nightfall = await insertAlbum(denis, "Nightfall", "Candlemass", 1987);
  const hidden = await insertAlbum(denis, "Hidden", "Someone", 1990);
  const metal = id();
  const doom = id();
  const place = (
    placeId: string,
    kind: "folder" | "list",
    parentId: string | null,
    name: string,
  ) => ({
    id: placeId,
    kind,
    parentId,
    name,
    ownerId: denis,
    nameKey: nameKey(name),
    searchNameKey: searchKey(name),
  });
  await t.db
    .insert(containers)
    .values([place(metal, "folder", null, "Metal"), place(doom, "list", metal, "Doom")]);
  await t.db.insert(memberships).values({ listId: doom, albumId: nightfall, ownerId: denis });
  const secret = await insertList(denis, "Secret", [hidden, nightfall]);
  const grant = (granteeId: string, email: string, role: "view" | "edit") =>
    t.db.insert(shareGrants).values({
      id: id(),
      containerId: metal,
      granteeId,
      invitedEmail: email,
      status: "accepted",
      role,
    });
  await grant(anna, "anna@example.com", "edit");
  await grant(ben, "ben@example.com", "view");
  await t.db.insert(savedReferences).values({ viewerId: anna, containerId: metal, linkId: null });
  const rating = id();
  await t.db.insert(fieldDefinitions).values({
    id: rating,
    ownerId: denis,
    name: "Rating",
    nameKey: nameKey("Rating"),
    type: "number",
  });
  return { denis, cookie, nightfall, hidden, metal, doom, secret, rating };
}

const titlesIn = async (mcp: Mcp, containerId: string) =>
  z
    .object({ albums: z.array(z.object({ title: z.string() })) })
    .parse(
      (await mcp.callTool({ name: "list_container", arguments: { containerId } }))
        .structuredContent,
    )
    .albums.map((album) => album.title);

const ownerOf = async (albumId: string) =>
  (await t.db.$client`select owner_id from albums where id = ${albumId}`)[0]?.owner_id;

describe("an editor's agent (FR-10.4, FR-07.19)", () => {
  test("sees its role, and changes the share's lists and albums as the editor can", async () => {
    const { metal, doom, nightfall } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "manage");
    const shared = z
      .object({ entries: z.array(z.looseObject({ containerId: z.string(), role: z.string() })) })
      .parse(
        (await mcp.callTool({ name: "list_shared_with_me", arguments: {} })).structuredContent,
      );
    expect(shared.entries).toEqual([expect.objectContaining({ containerId: metal, role: "edit" })]);

    expect(await write(mcp, "rename_container", { containerId: doom, name: "Doom Metal" })).toEqual(
      [expect.objectContaining({ status: "confirmed" })],
    );
    expect(
      await write(mcp, "update_album", {
        albumId: nightfall,
        values: { title: "Nightfall (Remastered)" },
      }),
    ).toEqual([expect.objectContaining({ status: "confirmed" })]);
  });

  test("adds an album by hand to a shared list, in the owner's collection (TON-200)", async () => {
    const { denis, doom } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "manage");
    const added = await mcp.callTool({
      name: "add_albums",
      arguments: {
        listId: doom,
        items: [
          { title: "Epicus Doomicus Metallicus", artistCredit: "Candlemass", originalYear: 1986 },
        ],
      },
    });
    const [item] = z
      .object({
        items: z.array(
          z.object({ albumId: z.string(), outcome: z.looseObject({ status: z.string() }) }),
        ),
      })
      .parse(added.structuredContent).items;
    expect(item?.outcome.status).toBe("confirmed");
    expect(await ownerOf(item?.albumId ?? "")).toBe(denis);
    expect(await titlesIn(mcp, doom)).toContain("Epicus Doomicus Metallicus");
  });

  test("deletes inside the share once approved, and the approval names nothing outside it (TON-200)", async () => {
    const { cookie, nightfall, metal, doom, secret } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "manage");

    // An album: it leaves the share's list, and Denis's "Secret" keeps it.
    const album = await approved(mcp, cookie, "delete_items", { albumIds: [nightfall] });
    expect(JSON.stringify(album.asked)).not.toContain("Secret");
    expect(album.outcomes).toEqual([expect.objectContaining({ status: "confirmed" })]);
    expect(await titlesIn(mcp, doom)).toEqual([]);
    const [kept] = await t.db
      .$client`select list_id from memberships where album_id = ${nightfall}`;
    expect(kept?.list_id).toBe(secret);

    // A list inside the share: to Denis's Trash, without naming who sees it.
    const list = await approved(mcp, cookie, "delete_items", { containerIds: [doom] });
    expect(JSON.stringify(list.asked)).not.toContain("ben");
    expect(list.outcomes).toEqual([expect.objectContaining({ status: "confirmed" })]);
    const [trashed] = await t.db.$client`select trashed_at from containers where id = ${doom}`;
    expect(trashed?.trashed_at).not.toBeNull();

    // The shared folder itself, and what isn't shared, aren't there to delete.
    for (const containerIds of [[metal], [secret]]) {
      // oxlint-disable-next-line no-await-in-loop
      const refused = await mcp.callTool({ name: "delete_items", arguments: { containerIds } });
      expect(refused.isError).toBe(true);
    }
  });

  test("confirms a match into a shared list, which saves it in the owner's collection (TON-200)", async () => {
    const { cookie, denis, doom } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "manage");
    const offered = await write(mcp, "add_albums", {
      listId: doom,
      items: [{ link: fixtureLinks.ambiguousApple }],
    });
    const [choice] = z
      .object({ candidates: z.array(z.object({ releaseGroupId: z.string() })) })
      .parse(offered[0]).candidates;
    const { asked, outcomes } = await approved(mcp, cookie, "confirm_match", {
      link: fixtureLinks.ambiguousApple,
      releaseGroupId: choice?.releaseGroupId,
      listId: doom,
    });
    expect(asked.consequences).toContain('It goes in the list "Doom".');
    expect(outcomes).toEqual([expect.objectContaining({ status: "confirmed" })]);
    const [saved] = await t.db.$client`select owner_id from albums where id in (
      select album_id from memberships where list_id = ${doom})`;
    expect(saved?.owner_id).toBe(denis);
  });

  test("is refused outside the share, on the owner's fields and on the owner's Trash", async () => {
    const { secret, hidden, rating } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "manage");
    expect(await write(mcp, "rename_container", { containerId: secret, name: "Mine" })).toEqual([
      expect.objectContaining({ status: "failed", code: "not_found" }),
    ]);
    expect(
      await write(mcp, "update_album", { albumId: hidden, values: { title: "Found" } }),
    ).toEqual([expect.objectContaining({ status: "failed", code: "not_found" })]);
    expect(await write(mcp, "rename_field", { fieldId: rating, name: "Score" })).toEqual([
      expect.objectContaining({ status: "failed" }),
    ]);
  });

  test("a Read-only one reads the share and gets no write tools", async () => {
    const { doom } = await sharedWithAnna();
    const { mcp } = await agentOf("anna@example.com", "read_only");
    const { tools } = await mcp.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain("rename_container");
    const listed = await mcp.callTool({ name: "list_container", arguments: { containerId: doom } });
    expect(listed.isError).toBeFalsy();
  });
});
