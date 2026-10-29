// The write tools for ordinary operations (TS-63, TON-82) as MCP contract tests for AC-36 and AC-37: a Manage
// collection connection makes the app's own changes, item by item, with TS-27's outcomes and safe retries by key, and
// nothing app-only is reachable. The collection is read back through the read tools, as an agent would.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { changeLog, executeMutation, viewPrefs } from "@tonaris/db";
import { shareToken, uuidv7, type Mutation, type McpPrincipal } from "@tonaris/domain";

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

/** Anna, connected as Manage collection, with her cookie and an MCP client. */
async function manager(email = "anna@example.com") {
  const clientId = await registerClient();
  const connection = await connect(email, clientId, "manage");
  return { ...connection, mcp: await mcpClient(connection.tokens.access_token) };
}

type Mcp = Awaited<ReturnType<typeof manager>>["mcp"];

const answerSchema = z.object({
  idempotencyKey: z.string(),
  items: z.array(z.looseObject({ outcome: z.looseObject({ status: z.string() }) })),
});

/** Calls a write tool and parses its answer. */
async function write(mcp: Mcp, name: string, args: Record<string, unknown>) {
  const answer = await mcp.callTool({ name, arguments: args });
  if (answer.isError)
    throw new Error(
      `${name} failed: ${JSON.stringify(answer.structuredContent ?? answer.content)}`,
    );
  return answerSchema.parse(answer.structuredContent);
}

const statuses = (answer: z.infer<typeof answerSchema>) =>
  answer.items.map((item) => item.outcome.status);

async function read(mcp: Mcp, name: string, args: Record<string, unknown> = {}) {
  return (await mcp.callTool({ name, arguments: args })).structuredContent;
}

const titlesIn = async (mcp: Mcp, containerId: string) =>
  z
    .object({ albums: z.array(z.object({ title: z.string() })) })
    .parse(await read(mcp, "list_container", { containerId }))
    .albums.map((album) => album.title);

describe("the tools a Manage connection gets (TS-62, TS-63, X-03)", () => {
  test("the read tools and the ordinary write tools, and none for app-only operations", async () => {
    const { mcp } = await manager();
    const { tools } = await mcp.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names.toSorted()).toEqual(
      [
        "add_albums",
        "add_options",
        "add_to_lists",
        "change_field_type",
        "create_container",
        "confirm_match",
        "create_field",
        "delete_field",
        "delete_items",
        "get_album",
        "get_approval",
        "get_operation",
        "get_overview",
        "list_container",
        "list_fields",
        "list_shared_with_me",
        "list_trash",
        "list_unsorted",
        "move_albums",
        "move_items",
        "recover_from_trash",
        "remove_from_lists",
        "remove_link",
        "remove_options",
        "remove_shared_reference",
        "rename_container",
        "rename_field",
        "rename_option",
        "save_shared_reference",
        "search",
        "set_album_fields",
        "set_artwork",
        "set_description",
        "set_link",
        "set_order",
        "set_view_preferences",
        "update_album",
      ].toSorted(),
    );
    // AC-37: nothing for permanent Trash removal, sharing management, account actions, export or admission.
    expect(
      names.filter((name) =>
        /purge|empty|share_|invite|export|account|admission|connection/.test(name),
      ),
    ).toEqual([]);
    const writing = tools.filter((tool) => tool.annotations?.readOnlyHint === false);
    expect(writing.length).toBe(27);
  });

  test("a Read-only connection can't call a write tool, even by name", async () => {
    const clientId = await registerClient();
    const { tokens } = await connect("ben@example.com", clientId, "read_only");
    const mcp = await mcpClient(tokens.access_token);
    const refused: unknown = await mcp
      .callTool({ name: "create_container", arguments: { kind: "list", name: "Doom" } })
      .catch((error: unknown) => error);
    expect(String(refused)).toContain("Tool create_container not found");
  });

  test("the app-only commands refuse an MCP principal, whatever its mode (AC-37)", async () => {
    const { userId } = await manager();
    const agent: McpPrincipal = { kind: "mcp", userId, grantId: id(), mode: "manage" };
    const list = await insertList(userId, "Doom");
    const appOnly: Mutation[] = [
      { mutationId: uuidv7(), name: "trash.purge", args: { unitIds: [id()] } },
      {
        mutationId: uuidv7(),
        name: "share.invite",
        args: { grantId: uuidv7(), containerId: list, email: "ben@example.com" },
      },
      {
        mutationId: uuidv7(),
        name: "share.setLink",
        args: { containerId: list, enabled: true, linkId: uuidv7() },
      },
      { mutationId: uuidv7(), name: "share.leave", args: { containerId: list } },
      { mutationId: uuidv7(), name: "account.setDisplayName", args: { displayName: "Agent" } },
    ];
    for (const mutation of appOnly) {
      // oxlint-disable-next-line no-await-in-loop -- one mutation at a time, under the owner's lock
      const { result } = await executeMutation(t.db, agent, mutation);
      expect({ name: mutation.name, outcome: result.outcome }).toMatchObject({
        name: mutation.name,
        outcome: { status: "failed", code: "app_only" },
      });
    }
  });
});

describe("organizing (FR-10.4)", () => {
  test("creates a folder and a list in it, and the list holds albums added to it", async () => {
    const { userId, mcp } = await manager();
    const folder = await write(mcp, "create_container", { kind: "folder", name: "Metal" });
    const folderId = z.string().parse(folder.items[0]?.containerId);
    const list = await write(mcp, "create_container", {
      kind: "list",
      name: "Doom",
      parentId: folderId,
      description: "Slow and heavy.",
    });
    expect(statuses(list)).toEqual(["confirmed", "confirmed"]);
    const listId = z.string().parse(list.items[0]?.containerId);
    expect(await read(mcp, "list_container", { containerId: listId })).toMatchObject({
      container: { name: "Doom", parentId: folderId, description: "Slow and heavy." },
    });

    const [nightfall, missing] = [await insertAlbum(userId, "Nightfall", "Candlemass", 1987), id()];
    const added = await write(mcp, "add_to_lists", {
      albumIds: [nightfall, missing],
      listIds: [listId],
    });
    expect(added.items).toEqual([
      {
        albumId: nightfall,
        listId,
        outcome: { status: "confirmed", result: { alreadyInList: false } },
      },
      {
        albumId: missing,
        listId,
        outcome: expect.objectContaining({ status: "failed", code: "not_found" }),
      },
    ]);
    const again = await write(mcp, "add_to_lists", { albumIds: [nightfall], listIds: [listId] });
    expect(again.items[0]?.outcome).toEqual({
      status: "confirmed",
      result: { alreadyInList: true },
    });
    expect(await titlesIn(mcp, listId)).toEqual(["Nightfall"]);

    // The agent's writes are the app's: in the change log, for the person's other sessions (X-08).
    const logged = await t.db.select({ mutationId: changeLog.mutationId }).from(changeLog);
    expect(logged.length).toBeGreaterThanOrEqual(4);
    expect(logged.every((row) => row.mutationId !== null)).toBe(true);
  });

  test("a stale name is a conflict with the current one; without a base, the rename applies", async () => {
    const { mcp } = await manager();
    const created = await write(mcp, "create_container", { kind: "list", name: "Doom" });
    const containerId = z.string().parse(created.items[0]?.containerId);
    const stale = await write(mcp, "rename_container", {
      containerId,
      name: "Epic Doom",
      base: { name: "Old name" },
    });
    expect(stale.items[0]?.outcome).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "name", current: "Doom" }],
    });
    expect(
      statuses(await write(mcp, "rename_container", { containerId, name: "Epic Doom" })),
    ).toEqual(["confirmed"]);
    expect(
      statuses(await write(mcp, "set_description", { containerId, description: "Long songs." })),
    ).toEqual(["confirmed"]);
    expect(await read(mcp, "list_container", { containerId })).toMatchObject({
      container: { name: "Epic Doom", description: "Long songs." },
    });
  });

  test("moves each folder or list on its own: a folder into itself fails alone", async () => {
    const { mcp } = await manager();
    const make = async (kind: string, name: string) =>
      z
        .string()
        .parse((await write(mcp, "create_container", { kind, name })).items[0]?.containerId);
    const metal = await make("folder", "Metal");
    const doom = await make("list", "Doom");
    const moved = await write(mcp, "move_items", { containerIds: [doom, metal], parentId: metal });
    expect(statuses(moved)).toEqual(["confirmed", "failed"]);
    expect(moved.items[1]?.outcome).toMatchObject({ code: "cycle" });
    expect(await read(mcp, "list_container", { containerId: metal })).toMatchObject({
      children: [{ id: doom, name: "Doom" }],
    });
  });

  test("moves albums between lists, and takes them out of lists into Unsorted", async () => {
    const { userId, mcp } = await manager();
    const [first, second] = [
      await insertAlbum(userId, "Nightfall", "Candlemass", 1987),
      await insertAlbum(userId, "Ancient Dreams", "Candlemass", 1988),
    ];
    const from = await insertList(userId, "Doom", [first, second]);
    const to = await insertList(userId, "Epic");
    const moved = await write(mcp, "move_albums", {
      albumIds: [first],
      fromListId: from,
      toListId: to,
    });
    expect(moved.items).toEqual([{ albumId: first, outcome: { status: "confirmed" } }]);
    expect(await titlesIn(mcp, from)).toEqual(["Ancient Dreams"]);
    expect(await titlesIn(mcp, to)).toEqual(["Nightfall"]);

    await write(mcp, "remove_from_lists", { albumIds: [second], listIds: [from] });
    expect(await read(mcp, "list_unsorted")).toMatchObject({
      albums: [{ title: "Ancient Dreams" }],
    });
  });

  test("arranges a list by hand, and sets how a view shows", async () => {
    const { userId, mcp } = await manager();
    const albums = await Promise.all(
      ["First", "Second", "Third"].map((title, n) => insertAlbum(userId, title, "Band", 2000 + n)),
    );
    const list = await insertList(userId, "Doom", albums);
    const [, second, third] = albums;
    const arranged = await write(mcp, "set_order", {
      view: list,
      itemIds: [third, second],
      place: "top",
    });
    expect(statuses(arranged)).toEqual(["confirmed"]);
    expect(await titlesIn(mcp, list)).toEqual(["Third", "Second", "First"]);
    await write(mcp, "set_order", { view: list, itemIds: [third], place: { after: albums[0] } });
    expect(await titlesIn(mcp, list)).toEqual(["Second", "First", "Third"]);

    const shown = await write(mcp, "set_view_preferences", { view: list, layout: "grid" });
    expect(statuses(shown)).toEqual(["confirmed"]);
    const [saved] = await t.db.select({ layout: viewPrefs.layout }).from(viewPrefs);
    expect(saved?.layout).toBe("grid");
  });
});

describe("albums (FR-10.4, FR-10.5)", () => {
  test("adds albums by hand into a list; one missing its year fails alone, and its list step is skipped", async () => {
    const { userId, mcp } = await manager();
    const list = await insertList(userId, "Doom");
    const added = await write(mcp, "add_albums", {
      listId: list,
      items: [
        { title: "Nightfall", artistCredit: "Candlemass", originalYear: 1987 },
        { title: "Undated", artistCredit: "Someone" },
      ],
    });
    expect(added.items).toEqual([
      {
        item: 0,
        albumId: expect.any(String),
        outcome: { status: "confirmed", result: { alreadyInList: false } },
      },
      {
        item: 1,
        albumId: expect.any(String),
        outcome: { status: "skipped", because: "failed", after: 2 },
      },
    ]);
    expect(await titlesIn(mcp, list)).toEqual(["Nightfall"]);
  });

  test("adds an album from a link, and asks for details of a link it can't tell", async () => {
    const { mcp } = await manager();
    const unknown = "https://open.spotify.com/album/0000000000000000000099";
    const added = await write(mcp, "add_albums", {
      items: [{ link: fixtureLinks.bleachSpotify }, { link: unknown }],
    });
    expect(statuses(added)).toEqual(["confirmed", "needs_input"]);
    expect(added.items[1]?.outcome).toMatchObject({ need: "details" });
    const albumId = z.string().parse(added.items[0]?.albumId);
    expect(await read(mcp, "get_album", { albumId })).toMatchObject({
      title: "Bleach",
      links: [{ service: "spotify" }],
    });

    const answered = await write(mcp, "add_albums", {
      items: [
        {
          link: unknown,
          details: { title: "Obscure", artistCredit: "Nobody", originalYear: 1999 },
        },
      ],
    });
    expect(statuses(answered)).toEqual(["confirmed"]);
  });

  test("edits an album's values, with a stale base a conflict", async () => {
    const { userId, mcp } = await manager();
    const albumId = await insertAlbum(userId, "Nightfal", "Candlemass", 1987);
    const fixed = await write(mcp, "update_album", {
      albumId,
      values: { title: "Nightfall" },
      base: { title: "Nightfal" },
    });
    expect(statuses(fixed)).toEqual(["confirmed"]);
    const stale = await write(mcp, "update_album", {
      albumId,
      values: { title: "Night" },
      base: { title: "Nightfal" },
    });
    expect(stale.items[0]?.outcome).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "title", current: "Nightfall" }],
    });
    expect(
      statuses(await write(mcp, "update_album", { albumId, values: { releaseType: "album" } })),
    ).toEqual(["confirmed"]);
    expect(await read(mcp, "get_album", { albumId })).toMatchObject({
      title: "Nightfall",
      releaseType: "album",
    });
  });

  test("sets custom fields: applies and sets in one go, clears, and removes", async () => {
    const { userId, mcp } = await manager();
    const albumId = await insertAlbum(userId, "Nightfall", "Candlemass", 1987);
    const field = await write(mcp, "create_field", {
      name: "Format",
      type: "single_choice",
      options: ["Vinyl", "CD"],
    });
    const fieldId = z.string().parse(field.items[0]?.fieldId);
    const [vinyl] = z.array(z.object({ id: z.string() })).parse(field.items[0]?.options);
    const notes = await write(mcp, "create_field", { name: "Notes", type: "text" });
    const notesId = z.string().parse(notes.items[0]?.fieldId);

    const set = await write(mcp, "set_album_fields", {
      changes: [
        { albumId, fieldId, action: "set", value: vinyl?.id },
        { albumId, fieldId: notesId, action: "set", value: "First pressing" },
      ],
    });
    expect(set.items).toEqual([
      { change: 0, albumId, fieldId, outcome: { status: "confirmed" } },
      { change: 1, albumId, fieldId: notesId, outcome: { status: "confirmed" } },
    ]);
    expect(await read(mcp, "get_album", { albumId })).toMatchObject({
      fields: [
        { name: "Format", chosen: [{ label: "Vinyl" }] },
        { name: "Notes", value: "First pressing" },
      ],
    });

    const cleared = await write(mcp, "set_album_fields", {
      changes: [
        { albumId, fieldId: notesId, action: "clear" },
        { albumId, fieldId, action: "remove" },
      ],
    });
    expect(statuses(cleared)).toEqual(["confirmed", "confirmed"]);
    expect(await read(mcp, "get_album", { albumId })).toMatchObject({
      fields: [{ name: "Notes", value: null }],
    });
  });
});

describe("custom fields (FR-10.4)", () => {
  test("creates, renames and retypes fields, and adds, renames and removes unused options", async () => {
    const { userId, mcp } = await manager();
    const created = await write(mcp, "create_field", {
      name: "Format",
      type: "single_choice",
      options: ["Vinyl"],
    });
    const fieldId = z.string().parse(created.items[0]?.fieldId);
    expect(statuses(await write(mcp, "rename_field", { fieldId, name: "Medium" }))).toEqual([
      "confirmed",
    ]);
    const added = await write(mcp, "add_options", { fieldId, labels: ["CD", "Tape"] });
    const [cd, tape] = added.items.map((item) => z.string().parse(item.optionId));
    expect(
      statuses(await write(mcp, "rename_option", { fieldId, optionId: tape, label: "Cassette" })),
    ).toEqual(["confirmed"]);

    // An option an album chooses isn't removed without the owner's approval.
    const albumId = await insertAlbum(userId, "Nightfall", "Candlemass", 1987);
    await write(mcp, "set_album_fields", {
      changes: [{ albumId, fieldId, action: "set", value: cd }],
    });
    const removed = await mcp.callTool({
      name: "remove_options",
      arguments: { fieldId, optionIds: [tape, cd] },
    });
    expect(removed.structuredContent).toMatchObject({ status: "needs_approval" });
    // Nothing was removed: the unused option waits with the chosen one, under one approval.
    const unused = await write(mcp, "remove_options", { fieldId, optionIds: [tape] });
    expect(statuses(unused)).toEqual(["confirmed"]);

    // A used field keeps its type; an unused one changes.
    const retyped = await write(mcp, "change_field_type", { fieldId, type: "text" });
    expect(retyped.items[0]?.outcome).toMatchObject({ code: "field_in_use" });
    const spare = await write(mcp, "create_field", { name: "Spare", type: "text" });
    const spareId = z.string().parse(spare.items[0]?.fieldId);
    expect(
      statuses(await write(mcp, "change_field_type", { fieldId: spareId, type: "number" })),
    ).toEqual(["confirmed"]);

    expect(await read(mcp, "list_fields")).toMatchObject({
      fields: [
        { id: fieldId, name: "Medium", options: [{ label: "Vinyl" }, { id: cd, label: "CD" }] },
        { id: spareId, type: "number" },
      ],
    });
  });
});

describe("shared references (FR-07.13, FR-10.4)", () => {
  test("keeps a share link's list in Shared with me, and drops it", async () => {
    const denis = await t.signIn("denis@example.com");
    const list = await insertList(denis.id, "Epic");
    const linkId = uuidv7();
    for (const [name, args] of [
      ["account.setDisplayName", { displayName: "Denis" }],
      ["share.setLink", { containerId: list, enabled: true, linkId }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- a name first: sharing needs one
      const response = await t.call("/v1/mutations", {
        json: { mutationId: uuidv7(), name, args },
        headers: { cookie: denis.cookie },
      });
      // oxlint-disable-next-line no-await-in-loop
      expect(await response.json()).toMatchObject({ outcome: { status: "confirmed" } });
    }
    const token = await shareToken(t.config.authSecret, linkId);

    const { mcp } = await manager();
    const saved = await write(mcp, "save_shared_reference", {
      url: `${t.config.webOrigin}/s/${token}`,
    });
    expect(statuses(saved)).toEqual(["confirmed"]);
    expect(await read(mcp, "list_shared_with_me")).toMatchObject({
      entries: [{ containerId: list, name: "Epic", via: { link: true } }],
    });
    const dropped = await write(mcp, "remove_shared_reference", { containerId: list });
    expect(statuses(dropped)).toEqual(["confirmed"]);
    expect(await read(mcp, "list_shared_with_me")).toEqual({ entries: [] });

    const notALink = await mcp.callTool({
      name: "save_shared_reference",
      arguments: { url: "https://example.com/elsewhere" },
    });
    expect(notALink.isError).toBe(true);
  });
});

describe("idempotency (TS-22, FR-13.5)", () => {
  test("the same key again replays the change: nothing is made twice", async () => {
    const { mcp } = await manager();
    const args = { kind: "list", name: "Doom", idempotencyKey: "make-doom-1" };
    const first = await write(mcp, "create_container", args);
    const again = await write(mcp, "create_container", args);
    expect(again).toEqual(first);
    expect(await read(mcp, "get_overview")).toMatchObject({ lists: 1 });

    const reused = await mcp.callTool({
      name: "create_container",
      arguments: { ...args, name: "Other" },
    });
    expect(reused.isError).toBe(true);
    expect(reused.structuredContent).toMatchObject({ code: "validation_failed" });
  });

  test("a change without a key gets one, which get_operation reports on", async () => {
    const { mcp } = await manager();
    const made = await write(mcp, "add_albums", {
      items: [
        { title: "Nightfall", artistCredit: "Candlemass", originalYear: 1987 },
        { title: "Undated", artistCredit: "Someone" },
      ],
    });
    expect(made.idempotencyKey).toBeTruthy();
    expect(await read(mcp, "get_operation", { idempotencyKey: made.idempotencyKey })).toMatchObject(
      {
        idempotencyKey: made.idempotencyKey,
        steps: [{ status: "confirmed" }, { status: "failed" }],
      },
    );
    const unknown = await mcp.callTool({
      name: "get_operation",
      arguments: { idempotencyKey: "never-sent" },
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.structuredContent).toMatchObject({ code: "not_found" });

    // Another connection's keys are its own.
    const other = await manager("ben@example.com");
    const theirs = await other.mcp.callTool({
      name: "get_operation",
      arguments: { idempotencyKey: made.idempotencyKey },
    });
    expect(theirs.structuredContent).toMatchObject({ code: "not_found" });
  });
});
