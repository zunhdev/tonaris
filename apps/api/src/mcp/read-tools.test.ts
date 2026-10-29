// The read tools (TS-63, TON-81) as MCP contract tests: a Read-only connection reads what the person may read in the
// app (FR-10.2), in their order, in pages, as structured data (TS-65), and their own and shared content only.
// Collections are made through the app's own mutations, as a person would.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { albumServiceLinks } from "@tonaris/db";
import { maxAlbums, maxContainers, maxFields, maxMemberships } from "@tonaris/domain";

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

const id = () => Bun.randomUUIDv7();

/** Runs an app mutation as the signed-in `cookie`, which must be confirmed. */
async function send(cookie: string, name: string, args: unknown, base?: unknown) {
  const mutationId = id();
  const response = await t.call("/v1/mutations", {
    json: { mutationId, name, args, ...(base === undefined ? {} : { base }) },
    headers: { cookie },
  });
  expect(await response.json()).toMatchObject({ outcome: { status: "confirmed" } });
  return mutationId;
}

const album = (title: string, artistCredit = "Someone", originalYear = 2000) => ({
  id: id(),
  title,
  artistCredit,
  releaseType: "album",
  isLive: false,
  originalYear,
  recordingYearStart: null,
  recordingYearEnd: null,
});

/** Anna, connected Read-only, with her cookie for the app and an MCP client. */
async function anna() {
  const clientId = await registerClient();
  const connection = await connect("anna@example.com", clientId, "read_only");
  return { ...connection, mcp: await mcpClient(connection.tokens.access_token) };
}

type Mcp = Awaited<ReturnType<typeof anna>>["mcp"];
const call = async (mcp: Mcp, name: string, args: Record<string, unknown> = {}) =>
  mcp.callTool({ name, arguments: args });

/** Denis, signed in with a display name, sharing a new list "Epic" holding one album with Anna. */
async function denisSharesWithAnna(annaCookie: string) {
  const denis = await t.signIn("denis@example.com");
  await send(denis.cookie, "account.setDisplayName", { displayName: "Denis" });
  const list = id();
  await send(denis.cookie, "container.create", {
    id: list,
    kind: "list",
    parentId: null,
    name: "Epic",
  });
  const shared = album("Epicus Doomicus Metallicus", "Candlemass", 1986);
  await send(denis.cookie, "album.create", shared);
  await send(denis.cookie, "membership.add", { listId: list, albumId: shared.id });
  const grantId = id();
  await send(denis.cookie, "share.invite", {
    grantId,
    containerId: list,
    email: "anna@example.com",
  });
  await send(annaCookie, "share.accept", { grantId });
  return { denis, list, albumId: shared.id };
}

describe("get_overview (TS-63)", () => {
  test("counts what the limits count, Trash included, and gives the tree breadth-first", async () => {
    const { cookie, mcp } = await anna();
    const [folder, inner, top] = [id(), id(), id()];
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
    await send(cookie, "container.create", { id: top, kind: "list", parentId: null, name: "Jazz" });
    const [kept, gone] = [album("Nightfall"), album("Ancient Dreams")];
    await send(cookie, "album.create", kept);
    await send(cookie, "album.create", gone);
    await send(cookie, "membership.add", { listId: inner, albumId: kept.id });
    await send(cookie, "album.delete", { id: gone.id, unitId: id() });
    await send(cookie, "field.create", { id: id(), name: "Format", type: "text", options: [] });

    const overview = await call(mcp, "get_overview");
    expect(overview.structuredContent).toEqual({
      albums: 1,
      unsorted: 0,
      folders: 1,
      lists: 2,
      trashUnits: 1,
      usage: {
        albums: { used: 2, limit: maxAlbums },
        foldersAndLists: { used: 3, limit: maxContainers },
        listEntries: { used: 1, limit: maxMemberships },
        fields: { used: 1, limit: maxFields },
      },
      tree: {
        items: [
          { id: folder, kind: "folder", name: "Metal", parentId: null },
          { id: top, kind: "list", name: "Jazz", parentId: null },
          { id: inner, kind: "list", name: "Doom", parentId: folder },
        ],
        total: 3,
        complete: true,
      },
      connection: { mode: "read_only" },
    });
  });
});

const pageSchema = z.object({
  albums: z.array(z.object({ id: z.string(), title: z.unknown() })),
  total: z.number(),
  nextCursor: z.string().nullable(),
});

describe("list_container (TS-63)", () => {
  test("lists a list in the person's manual order, then as added", async () => {
    const { cookie, mcp } = await anna();
    const list = id();
    await send(cookie, "container.create", {
      id: list,
      kind: "list",
      parentId: null,
      name: "Doom",
    });
    const albums = [album("First"), album("Second"), album("Third")];
    for (const each of albums) {
      // oxlint-disable-next-line no-await-in-loop -- in order, so the albums join the list in turn
      await send(cookie, "album.create", each);
      // oxlint-disable-next-line no-await-in-loop
      await send(cookie, "membership.add", { listId: list, albumId: each.id });
    }
    const [first, , third] = albums.map((each) => each.id);
    await send(
      cookie,
      "order.set",
      { viewKey: list, keys: { [third ?? ""]: "a0", [first ?? ""]: "a1" } },
      { [third ?? ""]: null, [first ?? ""]: null },
    );

    const listing = await call(mcp, "list_container", { containerId: list });
    expect(listing.structuredContent).toMatchObject({
      container: { id: list, kind: "list", name: "Doom", parentId: null, description: null },
      sharedBy: null,
      total: 3,
      nextCursor: null,
    });
    expect(pageSchema.parse(listing.structuredContent).albums.map((each) => each.title)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
  });

  test("pages through a long list, 200 at a time, and refuses a cursor it didn't give", async () => {
    const { userId, mcp } = await anna();
    const ids = await Promise.all(
      Array.from({ length: 205 }, (_, n) => insertAlbum(userId, `Album ${n}`, "Band", 2000)),
    );
    const list = await insertList(userId, "Everything", ids);

    const first = pageSchema.parse(
      (await call(mcp, "list_container", { containerId: list })).structuredContent,
    );
    expect(first.albums).toHaveLength(200);
    expect(first.total).toBe(205);
    const second = pageSchema.parse(
      (await call(mcp, "list_container", { containerId: list, cursor: first.nextCursor }))
        .structuredContent,
    );
    expect(second.albums).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.albums, ...second.albums].map((each) => each.id)).size).toBe(205);

    const forged = await call(mcp, "list_container", { containerId: list, cursor: "nonsense" });
    expect(forged.isError).toBe(true);
    expect(forged.structuredContent).toMatchObject({ status: "failed", code: "validation_failed" });
  });

  test("reads a list someone shares with the person, and nobody else's", async () => {
    const { cookie, mcp } = await anna();
    const { list, albumId } = await denisSharesWithAnna(cookie);
    const ben = await t.signIn("ben@example.com");
    const unshared = id();
    await send(ben.cookie, "container.create", {
      id: unshared,
      kind: "list",
      parentId: null,
      name: "Mine",
    });

    const listing = await call(mcp, "list_container", { containerId: list });
    expect(listing.structuredContent).toMatchObject({
      container: { id: list, name: "Epic" },
      sharedBy: "Denis",
      albums: [{ id: albumId, title: "Epicus Doomicus Metallicus" }],
    });
    const refused = await call(mcp, "list_container", { containerId: unshared });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toMatchObject({ code: "not_found" });
  });
});

describe("get_album (TS-63)", () => {
  test("gives an album in full: its values, links, field values and lists", async () => {
    const { userId, cookie, mcp } = await anna();
    const [folder, list, field, vinyl, cd] = [id(), id(), id(), id(), id()];
    await send(cookie, "container.create", {
      id: folder,
      kind: "folder",
      parentId: null,
      name: "Metal",
    });
    await send(cookie, "container.create", {
      id: list,
      kind: "list",
      parentId: folder,
      name: "Doom",
    });
    const record = album("Nightfall", "Candlemass", 1987);
    await send(cookie, "album.create", record);
    await send(cookie, "membership.add", { listId: list, albumId: record.id });
    await send(cookie, "field.create", {
      id: field,
      name: "Format",
      type: "single_choice",
      options: [
        { id: vinyl, label: "Vinyl" },
        { id: cd, label: "CD" },
      ],
    });
    await send(cookie, "fieldValue.apply", { albumId: record.id, fieldId: field });
    await send(
      cookie,
      "fieldValue.set",
      { albumId: record.id, fieldId: field, value: vinyl },
      { value: null },
    );
    const url = "https://open.spotify.com/album/0000000000000000000001";
    await t.db.insert(albumServiceLinks).values({
      albumId: record.id,
      ownerId: userId,
      service: "spotify",
      entityId: "0".repeat(21) + "1",
      url,
    });

    const found = await call(mcp, "get_album", { albumId: record.id });
    expect(found.structuredContent).toEqual({
      id: record.id,
      title: "Nightfall",
      artistCredit: "Candlemass",
      originalYear: 1987,
      releaseType: "album",
      isLive: false,
      recordingYearStart: null,
      recordingYearEnd: null,
      artworkUrl: null,
      inTrash: false,
      sharedBy: null,
      lists: [{ id: list, name: "Doom", location: ["Metal", "Doom"] }],
      links: [{ service: "spotify", url }],
      fields: [
        {
          fieldId: field,
          name: "Format",
          type: "single_choice",
          value: vinyl,
          chosen: [{ id: vinyl, label: "Vinyl" }],
        },
      ],
    });
  });

  test("reads an album in Trash of the person's own, an album shared with them, and nobody else's", async () => {
    const { cookie, mcp } = await anna();
    const { albumId: shared, denis } = await denisSharesWithAnna(cookie);
    const gone = album("Gone");
    await send(cookie, "album.create", gone);
    await send(cookie, "album.delete", { id: gone.id, unitId: id() });
    const unshared = album("Private");
    await send(denis.cookie, "album.create", unshared);

    expect((await call(mcp, "get_album", { albumId: gone.id })).structuredContent).toMatchObject({
      inTrash: true,
      lists: [],
    });
    expect((await call(mcp, "get_album", { albumId: shared })).structuredContent).toMatchObject({
      sharedBy: "Denis",
      lists: [{ name: "Epic", location: ["Epic"] }],
    });
    const refused = await call(mcp, "get_album", { albumId: unshared.id });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toMatchObject({ code: "not_found" });
  });
});

describe("Unsorted, Trash, fields and Shared with me (TS-63)", () => {
  test("list_unsorted lists albums in no list, newest first", async () => {
    const { cookie, mcp } = await anna();
    const [older, newer, sorted] = [album("Older"), album("Newer"), album("Sorted")];
    for (const each of [older, newer, sorted]) {
      // oxlint-disable-next-line no-await-in-loop -- in order: Unsorted is newest first
      await send(cookie, "album.create", each);
    }
    const list = id();
    await send(cookie, "container.create", {
      id: list,
      kind: "list",
      parentId: null,
      name: "Doom",
    });
    await send(cookie, "membership.add", { listId: list, albumId: sorted.id });

    const page = pageSchema.parse((await call(mcp, "list_unsorted")).structuredContent);
    expect(page.albums.map((each) => each.title)).toEqual(["Newer", "Older"]);
    expect(page.total).toBe(2);
  });

  test("list_trash lists each deletion with what it holds and when it expires", async () => {
    const { cookie, mcp } = await anna();
    const [folder, list, gone, unitId, albumUnit] = [id(), id(), album("Gone", "Band"), id(), id()];
    await send(cookie, "container.create", {
      id: folder,
      kind: "folder",
      parentId: null,
      name: "Old",
    });
    await send(cookie, "container.create", {
      id: list,
      kind: "list",
      parentId: folder,
      name: "Inside",
    });
    await send(cookie, "container.delete", { id: folder, unitId });
    await send(cookie, "album.create", gone);
    await send(cookie, "album.delete", { id: gone.id, unitId: albumUnit });

    const trash = await call(mcp, "list_trash");
    expect(trash.structuredContent).toMatchObject({
      units: [
        {
          unitId,
          kind: "folder",
          rootId: folder,
          name: "Old",
          artistCredit: null,
          folders: 0,
          lists: 1,
        },
        { unitId: albumUnit, kind: "album", rootId: gone.id, name: "Gone", artistCredit: "Band" },
      ],
      total: 2,
      nextCursor: null,
    });
  });

  test("list_fields lists each field with its options and usage", async () => {
    const { cookie, mcp } = await anna();
    const [field, option] = [id(), id()];
    await send(cookie, "field.create", {
      id: field,
      name: "Format",
      type: "single_choice",
      options: [{ id: option, label: "Vinyl" }],
    });
    const [kept, gone] = [album("Kept"), album("Gone")];
    for (const each of [kept, gone]) {
      // oxlint-disable-next-line no-await-in-loop -- one write at a time, as a person makes them
      await send(cookie, "album.create", each);
      // oxlint-disable-next-line no-await-in-loop
      await send(cookie, "fieldValue.apply", { albumId: each.id, fieldId: field });
    }
    await send(cookie, "album.delete", { id: gone.id, unitId: id() });

    expect((await call(mcp, "list_fields")).structuredContent).toEqual({
      fields: [
        {
          id: field,
          name: "Format",
          type: "single_choice",
          options: [{ id: option, label: "Vinyl" }],
          albums: 1,
          inTrash: 1,
        },
      ],
      limit: maxFields,
    });
  });

  test("list_shared_with_me names whose each is and how it is shared", async () => {
    const { cookie, mcp } = await anna();
    const { list } = await denisSharesWithAnna(cookie);
    expect((await call(mcp, "list_shared_with_me")).structuredContent).toEqual({
      entries: [
        {
          containerId: list,
          kind: "list",
          name: "Epic",
          sharedBy: "Denis",
          via: { invitation: true, link: false },
          available: true,
        },
      ],
    });
  });
});

describe("get_operation (TS-22, TS-63)", () => {
  test("gives a change's stored outcome, and says an unknown key was never received", async () => {
    const { cookie, mcp } = await anna();
    const made = await send(cookie, "album.create", album("Made"));

    expect(
      (await call(mcp, "get_operation", { idempotencyKey: made })).structuredContent,
    ).toMatchObject({
      idempotencyKey: made,
      outcome: { status: "confirmed" },
    });
    const unknown = await call(mcp, "get_operation", { idempotencyKey: id() });
    expect(unknown.isError).toBe(true);
    expect(unknown.structuredContent).toMatchObject({ code: "not_found" });
  });

  test("never answers for another account's change", async () => {
    const { mcp } = await anna();
    const ben = await t.signIn("ben@example.com");
    const theirs = await send(ben.cookie, "album.create", album("Theirs"));
    const refused = await call(mcp, "get_operation", { idempotencyKey: theirs });
    expect(refused.structuredContent).toMatchObject({ code: "not_found" });
  });
});
