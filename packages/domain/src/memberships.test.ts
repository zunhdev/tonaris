// The list entry commands against an in-memory store (FR-01.6–FR-01.9, X-05, TS-18): one test per spec scenario.
// The database layer runs the same commands inside the owner's write lock (TS-20), and its tests cover Unsorted
// and lists in Trash through the server's queries.

import { describe, expect, test } from "bun:test";

import type { Album } from "./albums";
import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import { maxMemberships } from "./limits";
import { membershipKey } from "./memberships";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const ben = uuidv7();
const benPrincipal: Principal = { kind: "user", userId: ben, role: "user", client: "web" };
const readOnlyAgent: Principal = {
  kind: "mcp",
  userId: owner,
  grantId: uuidv7(),
  mode: "read_only",
};
const now = new Date("2026-10-22T09:30:00.000Z");

const album = (
  title: string,
  values: Partial<Album & { ownerId: string; trashed: boolean }> = {},
) => ({
  id: uuidv7(),
  title,
  artistCredit: "Miles Davis",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1959,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  ownerId: owner,
  ...values,
});

function stored(
  kind: StoredContainer["kind"],
  name: string,
  values: Partial<StoredContainer> = {},
): StoredContainer {
  return {
    id: uuidv7(),
    kind,
    parentId: null,
    name,
    description: null,
    ownerId: owner,
    trashed: false,
    ...values,
  };
}
const list = (name: string, values: Partial<StoredContainer> = {}) => stored("list", name, values);

const add = (listId: string, albumId: string): Mutation => ({
  mutationId: uuidv7(),
  name: "membership.add",
  args: { listId, albumId },
});
const remove = (listId: string, albumId: string): Mutation => ({
  mutationId: uuidv7(),
  name: "membership.remove",
  args: { listId, albumId },
});

function setup(fill: Parameters<typeof memoryStore>[0] = {}) {
  const memory = memoryStore(fill);
  const run = (mutation: Mutation, principal: Principal = anna) =>
    runCommand(mutation, { principal, store: memory.store, now });
  /** The albums in `listId`, by title. */
  const titlesIn = (listId: string) =>
    [...memory.memberships.values()]
      .filter((entry) => entry.listId === listId)
      .map((entry) => memory.albums.get(entry.albumId)?.title);
  return { ...memory, run, titlesIn };
}

/** The outcome's error code, or its status when it isn't a rejection. */
function codeOf(result: CommandResult): string {
  return result.status === "failed" ? result.code : result.status;
}

describe("the envelopes", () => {
  test("parse with UUIDs, and refuse other IDs", () => {
    const listId = uuidv7();
    const albumId = uuidv7();
    expect(mutationSchema.safeParse(add(listId, albumId)).success).toBe(true);
    expect(mutationSchema.safeParse(remove(listId, albumId)).success).toBe(true);
    expect(mutationSchema.safeParse(add("favorites", albumId)).success).toBe(false);
  });

  test("a membership change is keyed by the list and the album, with no data once deleted", () => {
    const listId = uuidv7();
    const albumId = uuidv7();
    const change = {
      seq: 1,
      entity: "membership",
      id: membershipKey(listId, albumId),
      op: "delete",
      data: null,
      mutationId: uuidv7(),
    };
    expect(changeSchema.safeParse(change).success).toBe(true);
    expect(changeSchema.safeParse({ ...change, id: listId }).success).toBe(false);
  });
});

describe("albums in many lists (FR-01.6)", () => {
  test("an album in two lists is one record", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const lateNight = list("Late night");
    const { run, albums, titlesIn } = setup({
      albums: [kindOfBlue],
      containers: [favorites, lateNight],
    });

    expect(codeOf(await run(add(favorites.id, kindOfBlue.id)))).toBe("applied");
    expect(codeOf(await run(add(lateNight.id, kindOfBlue.id)))).toBe("applied");
    expect(titlesIn(favorites.id)).toEqual(["Kind of Blue"]);
    expect(titlesIn(lateNight.id)).toEqual(["Kind of Blue"]);
    expect(albums.size).toBe(1);
  });

  test("an edit from one list shows in every list", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const lateNight = list("Late night");
    const { run, albums, memberships } = setup({
      albums: [kindOfBlue],
      containers: [favorites, lateNight],
    });
    await run(add(favorites.id, kindOfBlue.id));
    await run(add(lateNight.id, kindOfBlue.id));

    const edit: Mutation = {
      mutationId: uuidv7(),
      name: "album.update",
      args: { id: kindOfBlue.id, originalYear: 1960 },
      base: { originalYear: 1959 },
    };
    expect(codeOf(await run(edit))).toBe("applied");
    const years = [...memberships.values()].map((entry) => albums.get(entry.albumId)?.originalYear);
    expect(years).toEqual([1960, 1960]);
  });
});

describe("membership.add: one entry per list (FR-01.7)", () => {
  test("adds the album with the server's time and logs the entry", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const { run, memberships } = setup({ albums: [kindOfBlue], containers: [favorites] });

    const entry = { listId: favorites.id, albumId: kindOfBlue.id, addedAt: now.toISOString() };
    expect(await run(add(favorites.id, kindOfBlue.id))).toEqual({
      status: "applied",
      changes: [
        {
          entity: "membership",
          id: membershipKey(favorites.id, kindOfBlue.id),
          op: "insert",
          data: entry,
        },
      ],
      result: { alreadyInList: false },
    });
    expect([...memberships.values()]).toEqual([{ ...entry, ownerId: owner }]);
  });

  test("adding it again keeps the entry and its time, and reports it", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const addedAt = "2026-01-05T18:00:00.000Z";
    const { run, memberships, albums } = setup({
      albums: [kindOfBlue],
      containers: [favorites],
      memberships: [{ listId: favorites.id, albumId: kindOfBlue.id, addedAt, ownerId: owner }],
    });

    expect(await run(add(favorites.id, kindOfBlue.id))).toEqual({
      status: "applied",
      changes: [],
      result: { alreadyInList: true },
    });
    expect([...memberships.values()]).toEqual([
      { listId: favorites.id, albumId: kindOfBlue.id, addedAt, ownerId: owner },
    ]);
    expect(albums.get(kindOfBlue.id)).toEqual({ ...kindOfBlue, trashed: false });
  });
});

describe("only active albums in active lists the owner has (FR-01.6, X-05)", () => {
  test("folders hold no albums", async () => {
    const kindOfBlue = album("Kind of Blue");
    const jazz = stored("folder", "Jazz");
    const { run, memberships } = setup({ albums: [kindOfBlue], containers: [jazz] });
    for (const mutation of [add(jazz.id, kindOfBlue.id), remove(jazz.id, kindOfBlue.id)]) {
      // oxlint-disable-next-line no-await-in-loop
      expect(codeOf(await run(mutation))).toBe("invalid_destination");
    }
    expect(memberships.size).toBe(0);
  });

  test("lists and albums in Trash are refused, for adding and removing", async () => {
    const kindOfBlue = album("Kind of Blue");
    const trashedAlbum = album("Blue Train", { trashed: true });
    const favorites = list("Favorites");
    const trashedList = list("Old favorites", { trashed: true });
    const entries = [trashedAlbum.id, kindOfBlue.id].map((albumId, index) => ({
      listId: index === 0 ? favorites.id : trashedList.id,
      albumId,
      addedAt: now.toISOString(),
      ownerId: owner,
    }));
    const { run, memberships } = setup({
      albums: [kindOfBlue, trashedAlbum],
      containers: [favorites, trashedList],
      memberships: entries,
    });

    const attempts = [
      add(trashedList.id, kindOfBlue.id),
      add(favorites.id, trashedAlbum.id),
      remove(trashedList.id, kindOfBlue.id),
      remove(favorites.id, trashedAlbum.id),
    ];
    for (const mutation of attempts) {
      // oxlint-disable-next-line no-await-in-loop
      expect(codeOf(await run(mutation))).toBe("trashed");
    }
    expect(memberships.size).toBe(2);
  });

  test("another person's list or album is refused, and so are missing ones", async () => {
    const kindOfBlue = album("Kind of Blue");
    const bensAlbum = album("Debut", { ownerId: ben });
    const favorites = list("Favorites");
    const bensList = list("Ben's", { ownerId: ben });
    const { run, memberships } = setup({
      albums: [kindOfBlue, bensAlbum],
      containers: [favorites, bensList],
    });

    expect(codeOf(await run(add(bensList.id, kindOfBlue.id)))).toBe("permission_denied");
    expect(codeOf(await run(add(bensList.id, bensAlbum.id)))).toBe("permission_denied");
    // Ben's album and a missing one get the same answer.
    expect(codeOf(await run(add(favorites.id, bensAlbum.id)))).toBe("not_found");
    expect(codeOf(await run(add(favorites.id, uuidv7())))).toBe("not_found");
    expect(codeOf(await run(add(uuidv7(), kindOfBlue.id)))).toBe("not_found");
    expect(codeOf(await run(add(favorites.id, kindOfBlue.id), benPrincipal))).toBe(
      "permission_denied",
    );
    expect(memberships.size).toBe(0);
  });

  test("a read-only connection can't add or remove", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const { run, memberships } = setup({ albums: [kindOfBlue], containers: [favorites] });
    for (const mutation of [
      add(favorites.id, kindOfBlue.id),
      remove(favorites.id, kindOfBlue.id),
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      expect(codeOf(await run(mutation, readOnlyAgent))).toBe("permission_denied");
    }
    expect(memberships.size).toBe(0);
  });
});

describe("membership.remove: albums stay in the collection (FR-01.8)", () => {
  test("removing one of several entries keeps the others and the album", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const lateNight = list("Late night");
    const { run, albums, titlesIn } = setup({
      albums: [kindOfBlue],
      containers: [favorites, lateNight],
    });
    await run(add(favorites.id, kindOfBlue.id));
    await run(add(lateNight.id, kindOfBlue.id));

    expect(await run(remove(favorites.id, kindOfBlue.id))).toEqual({
      status: "applied",
      changes: [
        {
          entity: "membership",
          id: membershipKey(favorites.id, kindOfBlue.id),
          op: "delete",
          data: null,
        },
      ],
    });
    expect(titlesIn(favorites.id)).toEqual([]);
    expect(titlesIn(lateNight.id)).toEqual(["Kind of Blue"]);
    expect(albums.get(kindOfBlue.id)).toEqual({ ...kindOfBlue, trashed: false });
  });

  test("removing the last entry keeps the album, in no list", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const { run, albums, memberships } = setup({ albums: [kindOfBlue], containers: [favorites] });
    await run(add(favorites.id, kindOfBlue.id));

    expect(codeOf(await run(remove(favorites.id, kindOfBlue.id)))).toBe("applied");
    expect(memberships.size).toBe(0);
    expect(albums.get(kindOfBlue.id)).toEqual({ ...kindOfBlue, trashed: false });
  });

  test("removing an entry that isn't there changes nothing", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const { run } = setup({ albums: [kindOfBlue], containers: [favorites] });
    expect(await run(remove(favorites.id, kindOfBlue.id))).toEqual({
      status: "applied",
      changes: [],
    });
  });
});

describe("the entry limit (FR-15.4, TS-18)", () => {
  test("adding past 50,000 entries is refused, counting Trash; removing and re-adding still work", async () => {
    const kindOfBlue = album("Kind of Blue");
    const favorites = list("Favorites");
    const inTrash = list("Old favorites", { trashed: true });
    const full = Array.from({ length: maxMemberships }, (_, index) => ({
      listId: index === 0 ? favorites.id : inTrash.id,
      albumId: index === 0 ? kindOfBlue.id : uuidv7(),
      addedAt: now.toISOString(),
      ownerId: owner,
    }));
    const blueTrain = album("Blue Train");
    const lateNight = list("Late night");
    const { run, memberships } = setup({
      albums: [kindOfBlue, blueTrain],
      containers: [favorites, inTrash, lateNight],
      memberships: full,
    });

    const over = await run(add(lateNight.id, blueTrain.id));
    expect(codeOf(over)).toBe("limit_exceeded");
    expect(over.status === "failed" && over.problem.detail).toContain("50,000");
    expect(memberships.size).toBe(maxMemberships);

    expect(await run(add(favorites.id, kindOfBlue.id))).toMatchObject({
      result: { alreadyInList: true },
    });
    expect(codeOf(await run(remove(favorites.id, kindOfBlue.id)))).toBe("applied");
    expect(codeOf(await run(add(lateNight.id, blueTrain.id)))).toBe("applied");
  });
});
