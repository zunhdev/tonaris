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
  shareLinks,
} from "@tonaris/db";
import { containerColors, latinKey, nameKey } from "@tonaris/domain";

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
    searchNameKey: latinKey(name),
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

  test("moving inside the share is told whether who can see it changes, as the app tells the editor (DRIFT-017)", async () => {
    const { denis, metal, doom } = await sharedWithAnna();
    // "Inner", in Metal, has a link of its own, so moving Doom in shows Doom to more people.
    const inner = id();
    await t.db.insert(containers).values({
      id: inner,
      kind: "folder",
      parentId: metal,
      name: "Inner",
      ownerId: denis,
      nameKey: nameKey("Inner"),
      searchNameKey: latinKey("Inner"),
    });
    await t.db
      .insert(shareLinks)
      .values({ id: id(), containerId: inner, tokenHash: Buffer.from("inner") });
    const { mcp } = await agentOf("anna@example.com", "manage");
    const answer = await mcp.callTool({
      name: "move_items",
      arguments: { containerIds: [doom], parentId: inner },
    });
    const [item] = z
      .object({ items: z.array(z.looseObject({ sharing: z.unknown().optional() })) })
      .parse(answer.structuredContent).items;
    // Nobody's access is named: the audiences stay the owner's to know (FR-07.20, DS-69).
    expect(item?.sharing).toEqual({ whoCanSeeItChanges: true, audiencesWithheld: true });
    expect(item).toMatchObject({ outcome: { status: "confirmed" } });
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

/**
 * What an editor's agent gets from each write tool inside a share: the change made, an approval to ask for, or a
 * refusal on what stays the owner's (FR-10.4, FR-07.19, FR-07.20). Four PRs fixed paths that assumed the person acting
 * owns the collection (TON-192, TON-193, TON-195, TON-200); every write tool is listed here, so a new one fails this
 * test until it is run as an editor too (DRIFT-024).
 */
describe("every write tool, as an editor's agent inside a share (DRIFT-024)", () => {
  type Answer = "confirmed" | "asks" | "refused";

  /** The tool's answer, reduced to what the table expects, and its items. */
  async function answerOf(mcp: Mcp, name: string, args: Record<string, unknown>) {
    const result = await mcp.callTool({ name, arguments: args });
    if (result.isError) return { answer: "refused" as Answer, items: [] };
    const structured = z
      .looseObject({ status: z.string().optional() })
      .parse(result.structuredContent);
    if (structured.status === "needs_approval") return { answer: "asks" as Answer, items: [] };
    const { items } = z
      .object({ items: z.array(z.looseObject({ outcome: z.looseObject({ status: z.string() }) })) })
      .parse(structured);
    const statuses = items.map((item) => item.outcome.status);
    const answer: string = statuses.every((status) => status === "confirmed")
      ? "confirmed"
      : statuses.includes("failed")
        ? "refused"
        : statuses.join(", ");
    return { answer, items };
  }

  test("each changes what's inside the share, asks for approval, or keeps the owner's own", async () => {
    const { denis, cookie: _cookie, nightfall, metal, doom, rating } = await sharedWithAnna();
    // A second list inside the share, for moves between lists.
    const sludge = id();
    await t.db.insert(containers).values({
      id: sludge,
      kind: "list",
      parentId: metal,
      name: "Sludge",
      ownerId: denis,
      nameKey: nameKey("Sludge"),
      searchNameKey: latinKey("Sludge"),
    });
    const { mcp } = await agentOf("anna@example.com", "manage");
    const offered = await write(mcp, "add_albums", {
      listId: doom,
      items: [{ link: fixtureLinks.ambiguousApple }],
    });
    const [choice] = z
      .object({ candidates: z.array(z.object({ releaseGroupId: z.string() })) })
      .parse(offered[0]).candidates;

    const made: { inner?: string; typed?: string } = {};
    const table: [name: string, args: () => Record<string, unknown>, expected: Answer][] = [
      ["create_container", () => ({ kind: "folder", name: "Inner", parentId: metal }), "confirmed"],
      ["rename_container", () => ({ containerId: doom, name: "Doom II" }), "confirmed"],
      ["set_color", () => ({ containerId: doom, color: containerColors[0] }), "confirmed"],
      ["set_description", () => ({ containerId: doom, description: "Slow" }), "confirmed"],
      ["move_items", () => ({ containerIds: [doom], parentId: made.inner }), "confirmed"],
      [
        "add_albums",
        () => ({
          listId: doom,
          items: [{ title: "Typed", artistCredit: "Someone", originalYear: 2000 }],
        }),
        "confirmed",
      ],
      ["add_to_lists", () => ({ albumIds: [made.typed], listIds: [sludge] }), "confirmed"],
      [
        "move_albums",
        () => ({ albumIds: [nightfall], fromListId: doom, toListId: sludge }),
        "confirmed",
      ],
      ["remove_from_lists", () => ({ albumIds: [made.typed], listIds: [sludge] }), "confirmed"],
      ["set_order", () => ({ view: sludge, itemIds: [nightfall], place: "top" }), "confirmed"],
      ["set_view_preferences", () => ({ view: sludge, layout: "grid" }), "confirmed"],
      [
        "update_album",
        () => ({ albumId: nightfall, values: { title: "Nightfall!" } }),
        "confirmed",
      ],
      ["set_artwork", () => ({ albumId: nightfall, artworkUrl: null }), "confirmed"],
      [
        "set_link",
        () => ({ albumId: nightfall, service: "spotify", url: fixtureLinks.bleachSpotify }),
        "confirmed",
      ],
      ["remove_link", () => ({ albumId: nightfall, service: "spotify" }), "confirmed"],
      // Editors set the owner's fields' values on shared albums (FR-07.20).
      [
        "set_album_fields",
        () => ({ changes: [{ albumId: nightfall, fieldId: rating, action: "set", value: "4" }] }),
        "confirmed",
      ],
      // A new field is the agent's person's own.
      ["create_field", () => ({ name: "Mood", type: "text" }), "confirmed"],
      // The owner's fields' definitions stay the owner's (FR-07.20).
      ["rename_field", () => ({ fieldId: rating, name: "Score" }), "refused"],
      ["change_field_type", () => ({ fieldId: rating, type: "text" }), "refused"],
      ["add_options", () => ({ fieldId: rating, labels: ["High"] }), "refused"],
      ["rename_option", () => ({ fieldId: rating, optionId: id(), label: "High" }), "refused"],
      ["remove_options", () => ({ fieldId: rating, optionIds: [id()] }), "refused"],
      ["delete_field", () => ({ fieldId: rating }), "refused"],
      ["delete_items", () => ({ containerIds: [sludge] }), "asks"],
      [
        "confirm_match",
        () => ({
          link: fixtureLinks.ambiguousApple,
          releaseGroupId: choice?.releaseGroupId,
          listId: doom,
        }),
        "asks",
      ],
      // Agents never undo an editor's deletion; the owner's Trash is the owner's (TON-192).
      ["recover_from_trash", () => ({ items: [{ unitId: id() }] }), "refused"],
      [
        "save_shared_reference",
        () => ({ url: `https://tonaris.app/s/${"x".repeat(43)}` }),
        "refused",
      ],
      ["remove_shared_reference", () => ({ containerId: metal }), "confirmed"],
    ];

    const { tools } = await mcp.listTools();
    const writeTools = tools
      .filter((tool) => tool.annotations?.readOnlyHint !== true)
      .map((tool) => tool.name);
    // A write tool missing here was never run as an editor: add it, with what an editor's agent should get.
    expect(table.map(([name]) => name).toSorted()).toEqual(writeTools.toSorted());

    const answers: Record<string, string> = {};
    for (const [name, args, _expected] of table) {
      // oxlint-disable-next-line no-await-in-loop
      const { answer, items } = await answerOf(mcp, name, args());
      answers[name] = answer;
      if (name === "create_container") made.inner = z.string().parse(items[0]?.containerId);
      if (name === "add_albums") made.typed = z.string().parse(items[0]?.albumId);
    }
    expect(answers).toEqual(
      Object.fromEntries(table.map(([name, , expected]) => [name, expected])),
    );
  });
});
