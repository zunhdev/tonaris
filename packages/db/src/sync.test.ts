// The sync protocol's storage against the local Postgres 18 (TS-20–TS-24, TS-121): the write lock, gapless
// `seq`, idempotent replay, rejections that change nothing, and a bootstrap snapshot consistent with its `seq`.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import {
  appAccountDefaults,
  maxAlbums,
  maxContainerDepth,
  maxContainers,
  maxMemberships,
  membershipKey,
  syncRetentionMs,
  uuidv7,
  type Album,
  type Batch,
  type BatchItem,
  type Change,
  type Container,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { collectionOverview, listContainer } from "./mcp";
import {
  accountSync,
  albums,
  changeLog,
  containers,
  memberships,
  mutations,
  trashUnits,
  users,
} from "./schema";
import { searchCollection } from "./search";
import {
  bootstrapSnapshot,
  executeBatch,
  executeMutation,
  findMutationResult,
  headSeq,
  pruneSyncHistory,
  readChanges,
} from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

async function newPrincipal(): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  return { kind: "user", userId, role: "user", client: "web" };
}

const album = (values: Partial<Album> = {}): Album => ({
  id: uuidv7(),
  title: "Kind of Blue",
  artistCredit: "Miles Davis",
  releaseType: "album",
  isLive: false,
  originalYear: 1959,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  ...values,
});

const create = (args: Album = album()): Extract<Mutation, { name: "album.create" }> => ({
  mutationId: uuidv7(),
  name: "album.create",
  args,
});

const retitle = (id: string, title: string, base: string): Mutation => ({
  mutationId: uuidv7(),
  name: "album.update",
  args: { id, title },
  base: { title: base },
});

/** A container row, as the M2 commands will write it. */
function container(
  id: string,
  ownerId: string,
  kind: "folder" | "list",
  parentId: string | null,
  name: string,
) {
  return {
    id,
    ownerId,
    kind,
    parentId,
    name,
    nameKey: name.toLowerCase(),
    searchNameKey: name.toLowerCase(),
  };
}

async function changeCount(accountId: string): Promise<number> {
  const rows = await t.db.select().from(changeLog).where(eq(changeLog.accountId, accountId));
  return rows.length;
}

describe("executeMutation (TS-20)", () => {
  test("applies a create, logs it at the next seq and stores the outcome", async () => {
    const anna = await newPrincipal();
    const args = album();
    const mutation = create(args);

    const executed = await executeMutation(t.db, anna, mutation);
    expect(executed).toEqual({
      result: {
        mutationId: mutation.mutationId,
        outcome: { status: "confirmed", seq: 1, result: null },
      },
      changes: [
        {
          seq: 1,
          entity: "album",
          id: args.id,
          op: "insert",
          data: args,
          mutationId: mutation.mutationId,
        },
      ],
      replayed: false,
    });
    expect(await headSeq(t.db, anna.userId)).toBe(1);
    const [row] = await t.db.select().from(albums).where(eq(albums.id, args.id));
    expect(row).toMatchObject({ ownerId: anna.userId, searchTitleKey: "kind of blue" });
    expect(await findMutationResult(t.db, anna.userId, mutation.mutationId)).toEqual(
      executed.result,
    );
  });

  test("replays the stored outcome of a mutation sent again, without applying it twice (FR-13.5)", async () => {
    const anna = await newPrincipal();
    const mutation = create();
    const first = await executeMutation(t.db, anna, mutation);
    const again = await executeMutation(t.db, anna, mutation);

    expect(again).toEqual({ result: first.result, changes: [], replayed: true });
    expect(await headSeq(t.db, anna.userId)).toBe(1);
    expect(await changeCount(anna.userId)).toBe(1);
  });

  test("applies once when copies of a mutation arrive together: each copy waits for the lock", async () => {
    const anna = await newPrincipal();
    const mutation = create();
    const copies = await Promise.all(
      Array.from({ length: 5 }, () => executeMutation(t.db, anna, mutation)),
    );

    expect(copies.filter((copy) => !copy.replayed)).toHaveLength(1);
    for (const copy of copies)
      expect(copy.result.outcome).toEqual({ status: "confirmed", seq: 1, result: null });
    expect(await t.db.select().from(albums)).toHaveLength(1);
  });

  test("serializes an account's concurrent writes into a gapless seq", async () => {
    const anna = await newPrincipal();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => executeMutation(t.db, anna, create())),
    );

    const seqs = results.map(({ result }) =>
      result.outcome.status === "confirmed" ? result.outcome.seq : 0,
    );
    expect(seqs.toSorted((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const log = await readChanges(t.db, anna.userId, 0, 100);
    expect(log.map((change) => change.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  test("keeps each account's seq separate", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    await executeMutation(t.db, anna, create());
    await executeMutation(t.db, anna, create());
    await executeMutation(t.db, ben, create());
    expect([await headSeq(t.db, anna.userId), await headSeq(t.db, ben.userId)]).toEqual([2, 1]);
  });

  test("stores a conflict without using a seq, and replays it even once the base would match", async () => {
    const anna = await newPrincipal();
    const args = album();
    await executeMutation(t.db, anna, create(args));
    await executeMutation(t.db, anna, retitle(args.id, "A", "Kind of Blue"));

    const stale = retitle(args.id, "B", "Kind of Blue");
    const conflict = await executeMutation(t.db, anna, stale);
    expect(conflict.result.outcome).toEqual({
      status: "conflict",
      conflicts: [{ field: "title", current: "A", attempted: "B", base: "Kind of Blue" }],
    });
    expect(conflict.changes).toEqual([]);
    expect(await headSeq(t.db, anna.userId)).toBe(2);

    // The saved title returns to the stale base. Retrying the conflicted mutation still isn't a blind write.
    await executeMutation(t.db, anna, retitle(args.id, "Kind of Blue", "A"));
    const retried = await executeMutation(t.db, anna, stale);
    expect(retried).toEqual({ result: conflict.result, changes: [], replayed: true });
    const [row] = await t.db.select().from(albums).where(eq(albums.id, args.id));
    expect(row?.title).toBe("Kind of Blue");
  });

  test("changes nothing for a rejected mutation (X-05)", async () => {
    const anna = await newPrincipal();
    const rejected = await executeMutation(t.db, anna, create(album({ title: " " })));
    expect(rejected.result.outcome).toMatchObject({ status: "failed", code: "required_missing" });
    expect(await t.db.select().from(albums)).toHaveLength(0);
    expect(await changeCount(anna.userId)).toBe(0);
    expect(await headSeq(t.db, anna.userId)).toBe(0);
  });

  test("refuses a mutation too old to have an idempotency record (TS-22)", async () => {
    const anna = await newPrincipal();
    const old: Mutation = {
      ...create(),
      mutationId: uuidv7(Date.now() - syncRetentionMs - 60_000),
    };
    const executed = await executeMutation(t.db, anna, old);
    expect(executed.result.outcome).toMatchObject({ status: "failed", code: "expired" });
    expect(await t.db.select().from(albums)).toHaveLength(0);
    expect(await findMutationResult(t.db, anna.userId, old.mutationId)).toBeUndefined();
  });

  test("refuses a mutation ID another account used, and keeps results private", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    const mutation = create();
    await executeMutation(t.db, anna, mutation);
    const reused = await executeMutation(t.db, ben, { ...mutation, args: album() });
    expect(reused.result.outcome).toMatchObject({ status: "failed", code: "validation_failed" });
    expect(await findMutationResult(t.db, ben.userId, mutation.mutationId)).toBeUndefined();
  });
});

describe("the change log (TS-23)", () => {
  test("reads changes after a cursor, in order and in pages", async () => {
    const anna = await newPrincipal();
    for (let index = 0; index < 5; index += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await executeMutation(t.db, anna, create());
    }
    const page = await readChanges(t.db, anna.userId, 2, 2);
    expect(page.map((change) => change.seq)).toEqual([3, 4]);
    expect(await readChanges(t.db, anna.userId, 5, 10)).toEqual([]);
  });

  test("forgets changes and idempotency records past the retention window", async () => {
    const anna = await newPrincipal();
    const mutation = create();
    await executeMutation(t.db, anna, mutation);
    await executeMutation(t.db, anna, create());
    const old = new Date(Date.now() - syncRetentionMs - 1_000);
    await t.db.update(changeLog).set({ createdAt: old }).where(eq(changeLog.seq, 1));
    await t.db
      .update(mutations)
      .set({ receivedAt: old })
      .where(eq(mutations.id, mutation.mutationId));

    await pruneSyncHistory(t.db);
    expect((await readChanges(t.db, anna.userId, 0, 10)).map((change) => change.seq)).toEqual([2]);
    expect(await findMutationResult(t.db, anna.userId, mutation.mutationId)).toBeUndefined();
    expect(await headSeq(t.db, anna.userId)).toBe(2);
  });
});

describe("bootstrapSnapshot (TS-24)", () => {
  test("is empty at seq 0 for a new account", async () => {
    const anna = await newPrincipal();
    expect(await bootstrapSnapshot(t.db, anna.userId)).toEqual({
      seq: 0,
      albums: [],
      containers: [],
      memberships: [],
      links: [],
      fields: [],
      fieldValues: [],
      views: [],
      positions: [],
      defaults: appAccountDefaults,
      trashUnits: [],
      references: [],
    });
  });

  test("carries the account's folders, lists and list entries", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    const args = album();
    await executeMutation(t.db, anna, create(args));
    const folderId = uuidv7();
    const listId = uuidv7();
    await t.db
      .insert(containers)
      .values([
        container(folderId, anna.userId, "folder", null, "Jazz"),
        container(listId, anna.userId, "list", folderId, "Hard bop"),
        container(uuidv7(), ben.userId, "list", null, "Ben's"),
      ]);
    const addedAt = new Date("2026-10-21T08:00:00.000Z");
    await t.db
      .insert(memberships)
      .values({ listId, albumId: args.id, ownerId: anna.userId, addedAt });

    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    // In ID order; two UUIDv7s made in the same millisecond can come either way.
    expect(snapshot.containers).toEqual(
      [
        { id: folderId, kind: "folder" as const, parentId: null, name: "Jazz", description: null },
        {
          id: listId,
          kind: "list" as const,
          parentId: folderId,
          name: "Hard bop",
          description: null,
        },
      ].toSorted((a, b) => a.id.localeCompare(b.id)),
    );
    expect(snapshot.memberships).toEqual([
      { listId, albumId: args.id, addedAt: "2026-10-21T08:00:00.000Z" },
    ]);
  });

  test("returns only the account's albums, current at the seq it reports, even during writes", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    await executeMutation(t.db, ben, create());

    const writes = Promise.all(
      Array.from({ length: 30 }, () => executeMutation(t.db, anna, create())),
    );
    const snapshots = await Promise.all(
      Array.from({ length: 10 }, async (_, index) => {
        await Bun.sleep(index * 3);
        return bootstrapSnapshot(t.db, anna.userId);
      }),
    );
    await writes;

    // Each change here creates one album, so a consistent snapshot holds exactly `seq` albums.
    for (const snapshot of snapshots) expect(snapshot.albums).toHaveLength(snapshot.seq);
    const final = await bootstrapSnapshot(t.db, anna.userId);
    expect(final.seq).toBe(30);
    expect(final.albums).toHaveLength(30);
  });

  test("holds the account_sync row the lock creates", async () => {
    const anna = await newPrincipal();
    await executeMutation(t.db, anna, create(album({ title: "" })));
    const rows = await t.db
      .select()
      .from(accountSync)
      .where(eq(accountSync.accountId, anna.userId));
    expect(rows).toEqual([expect.objectContaining({ seq: 0 })]);
    const [{ count } = { count: -1 }] = await t.db.execute<{ count: number }>(
      sql`select count(*)::int as count from mutations`,
    );
    expect(count).toBe(1);
  });
});

/** Puts a container in Trash, in a unit of its own (TS-13). */
async function trash(ownerId: string, id: string): Promise<void> {
  const unitId = uuidv7();
  const deletedAt = new Date();
  await t.db.insert(trashUnits).values({
    id: unitId,
    ownerId,
    kind: "folder",
    rootId: id,
    deletedAt,
    expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
  });
  await t.db
    .update(containers)
    .set({ trashedAt: deletedAt, trashUnitId: unitId })
    .where(eq(containers.id, id));
}

async function parentOf(id: string): Promise<string | null | undefined> {
  const [row] = await t.db.select().from(containers).where(eq(containers.id, id));
  return row?.parentId;
}

const createContainer = (args: Container): Mutation => ({
  mutationId: uuidv7(),
  name: "container.create",
  args,
});
const moveContainer = (id: string, parentId: string | null, base: string | null): Mutation => ({
  mutationId: uuidv7(),
  name: "container.move",
  args: { id, parentId },
  base: { parentId: base },
});
const renameContainer = (id: string, name: string, base: string): Mutation => ({
  mutationId: uuidv7(),
  name: "container.rename",
  args: { id, name },
  base: { name: base },
});
const node = (
  kind: Container["kind"],
  name: string,
  parentId: string | null = null,
): Container => ({
  id: uuidv7(),
  kind,
  parentId,
  description: null,
  name,
});

/** Inserts `count` folders, each inside the one before; the last is `count` levels deep. */
async function nestedFolders(ownerId: string, count: number): Promise<string[]> {
  const ids = Array.from({ length: count }, () => uuidv7());
  await t.db
    .insert(containers)
    .values(
      ids.map((id, index) => container(id, ownerId, "folder", ids[index - 1] ?? null, `L${index}`)),
    );
  return ids;
}

describe("folders and lists (FR-01.1–FR-01.5, TS-31)", () => {
  test("nested creates and a folder move: the subtree comes along, logged as one change", async () => {
    const anna = await newPrincipal();
    const jazz = node("folder", "Jazz");
    const bebop = node("folder", "Bebop", jazz.id);
    const hardBop = node("folder", "Hard bop", bebop.id);
    const favorites = node("list", "Favorites", bebop.id);
    for (const each of [jazz, bebop, hardBop, favorites]) {
      // oxlint-disable-next-line no-await-in-loop
      const { result } = await executeMutation(t.db, anna, createContainer(each));
      expect(result.outcome.status).toBe("confirmed");
    }

    const moved = await executeMutation(t.db, anna, moveContainer(bebop.id, null, jazz.id));
    expect(moved.result.outcome).toEqual({ status: "confirmed", seq: 5, result: null });
    expect(moved.changes).toEqual([
      {
        seq: 5,
        entity: "container",
        id: bebop.id,
        op: "update",
        data: { ...bebop, parentId: null },
        mutationId: moved.result.mutationId,
      },
    ]);
    expect(await parentOf(bebop.id)).toBeNull();
    expect(await parentOf(hardBop.id)).toBe(bebop.id);
    expect(await parentOf(favorites.id)).toBe(bebop.id);
    expect((await readChanges(t.db, anna.userId, 0, 10)).map((change) => change.entity)).toEqual(
      Array.from({ length: 5 }, () => "container"),
    );

    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    expect(snapshot.containers).toContainEqual({ ...bebop, parentId: null });
  });

  test("a cycle and a too-deep move are rejected without using a seq", async () => {
    const anna = await newPrincipal();
    const chain = await nestedFolders(anna.userId, maxContainerDepth);
    const before = await headSeq(t.db, anna.userId);

    const cycle = await executeMutation(t.db, anna, moveContainer(chain[0]!, chain[5]!, null));
    expect(cycle.result.outcome).toMatchObject({ status: "failed", code: "cycle" });

    // A folder holding one list, moved into the 31st level, would put the list at 33.
    const moved = node("folder", "Moved");
    await executeMutation(t.db, anna, createContainer(moved));
    await executeMutation(t.db, anna, createContainer(node("list", "Leaf", moved.id)));
    const afterCreates = await headSeq(t.db, anna.userId);
    const deep = await executeMutation(t.db, anna, moveContainer(moved.id, chain[30]!, null));
    expect(deep.result.outcome).toMatchObject({ status: "failed", code: "limit_exceeded" });
    const deepest = chain.at(-1);
    if (!deepest) throw new Error("The chain is empty.");
    const inDeepest = await executeMutation(
      t.db,
      anna,
      createContainer(node("list", "Too deep", deepest)),
    );
    expect(inDeepest.result.outcome).toMatchObject({ status: "failed", code: "limit_exceeded" });

    expect(afterCreates).toBe(before + 2);
    expect(await headSeq(t.db, anna.userId)).toBe(afterCreates);
    expect(await parentOf(chain[0]!)).toBeNull();
    expect(await parentOf(moved.id)).toBeNull();
    // One level less fits.
    const fits = await executeMutation(t.db, anna, moveContainer(moved.id, chain[29]!, null));
    expect(fits.result.outcome.status).toBe("confirmed");
  });

  test("a container in Trash can't be changed, and reserves no name", async () => {
    const anna = await newPrincipal();
    const jazz = node("folder", "Jazz");
    await executeMutation(t.db, anna, createContainer(jazz));
    await trash(anna.userId, jazz.id);

    const renamed = await executeMutation(t.db, anna, renameContainer(jazz.id, "Back", "Jazz"));
    expect(renamed.result.outcome).toMatchObject({ status: "failed", code: "trashed" });
    const again = await executeMutation(t.db, anna, createContainer(node("list", "JAZZ")));
    expect(again.result.outcome.status).toBe("confirmed");
  });

  test("names collide case-insensitively among active siblings of either kind", async () => {
    const anna = await newPrincipal();
    await executeMutation(t.db, anna, createContainer(node("folder", "Jazz")));
    const collision = await executeMutation(t.db, anna, createContainer(node("list", " jazz ")));
    expect(collision.result.outcome).toMatchObject({ status: "failed", code: "name_conflict" });
  });

  test("the count includes Trash", async () => {
    const anna = await newPrincipal();
    const ids = Array.from({ length: maxContainers }, () => uuidv7());
    await t.db
      .insert(containers)
      .values(ids.map((id, index) => container(id, anna.userId, "list", null, `List ${index}`)));
    await trash(anna.userId, ids[0]!);

    const over = await executeMutation(t.db, anna, createContainer(node("list", "One more")));
    expect(over.result.outcome).toMatchObject({ status: "failed", code: "limit_exceeded" });
    expect(await headSeq(t.db, anna.userId)).toBe(0);
  });

  test("a container mutation sent again replays its outcome", async () => {
    const anna = await newPrincipal();
    const mutation = createContainer(node("list", "Later"));
    const first = await executeMutation(t.db, anna, mutation);
    const replay = await executeMutation(t.db, anna, mutation);
    expect(replay).toEqual({ result: first.result, changes: [], replayed: true });
    expect(await changeCount(anna.userId)).toBe(1);
  });
});

const addEntry = (listId: string, albumId: string): Mutation => ({
  mutationId: uuidv7(),
  name: "membership.add",
  args: { listId, albumId },
});
const removeEntry = (listId: string, albumId: string): Mutation => ({
  mutationId: uuidv7(),
  name: "membership.remove",
  args: { listId, albumId },
});

/** Saves an album for `principal` through its command, and returns it. */
async function savedAlbum(principal: Principal, title: string): Promise<Album> {
  const args = album({ title });
  const { result } = await executeMutation(t.db, principal, create(args));
  expect(result.outcome.status).toBe("confirmed");
  return args;
}

/** Creates a list at the root for `principal` through its command, and returns it. */
async function savedList(principal: Principal, name: string): Promise<Container> {
  const list = node("list", name);
  const { result } = await executeMutation(t.db, principal, createContainer(list));
  expect(result.outcome.status).toBe("confirmed");
  return list;
}

async function savedFolder(principal: Principal, name: string): Promise<Container> {
  const folder = node("folder", name);
  const { result } = await executeMutation(t.db, principal, createContainer(folder));
  expect(result.outcome.status).toBe("confirmed");
  return folder;
}

describe("list entries (FR-01.6–FR-01.8)", () => {
  test("an add is logged at the next seq with the server's time, and a retry replays it", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const favorites = await savedList(anna, "Favorites");
    const now = new Date("2026-10-22T09:30:00.000Z");
    const mutation = addEntry(favorites.id, kindOfBlue.id);

    const added = await executeMutation(t.db, anna, mutation, now);
    const entry = { listId: favorites.id, albumId: kindOfBlue.id, addedAt: now.toISOString() };
    expect(added.result.outcome).toEqual({
      status: "confirmed",
      seq: 3,
      result: { alreadyInList: false },
    });
    expect(added.changes).toEqual([
      {
        seq: 3,
        entity: "membership",
        id: membershipKey(favorites.id, kindOfBlue.id),
        op: "insert",
        data: entry,
        mutationId: mutation.mutationId,
      },
    ]);
    expect(await readChanges(t.db, anna.userId, 2, 10)).toEqual(added.changes);

    const replay = await executeMutation(t.db, anna, mutation);
    expect(replay).toEqual({ result: added.result, changes: [], replayed: true });
    expect((await bootstrapSnapshot(t.db, anna.userId)).memberships).toEqual([entry]);
  });

  test("adding it again keeps its time, uses no seq and reports it as already in the list", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const favorites = await savedList(anna, "Favorites");
    const first = new Date("2026-10-22T09:30:00.000Z");
    await executeMutation(t.db, anna, addEntry(favorites.id, kindOfBlue.id), first);

    const again = await executeMutation(
      t.db,
      anna,
      addEntry(favorites.id, kindOfBlue.id),
      new Date("2026-10-23T10:00:00.000Z"),
    );
    expect(again.result.outcome).toEqual({
      status: "confirmed",
      seq: 3,
      result: { alreadyInList: true },
    });
    expect(again.changes).toEqual([]);
    expect(await headSeq(t.db, anna.userId)).toBe(3);
    expect((await bootstrapSnapshot(t.db, anna.userId)).memberships).toEqual([
      { listId: favorites.id, albumId: kindOfBlue.id, addedAt: first.toISOString() },
    ]);
  });

  test("a remove is logged as a delete, and the album stays, at the top of Unsorted", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const favorites = await savedList(anna, "Favorites");
    await executeMutation(t.db, anna, addEntry(favorites.id, kindOfBlue.id));

    const removed = await executeMutation(t.db, anna, removeEntry(favorites.id, kindOfBlue.id));
    // The entry's delete, then the album entering Unsorted at the top (DS-51).
    expect(removed.result.outcome).toEqual({ status: "confirmed", seq: 5, result: null });
    const atTop = { viewKey: "unsorted", itemId: kindOfBlue.id, key: "a0" };
    expect(removed.changes).toEqual([
      expect.objectContaining({
        entity: "membership",
        id: membershipKey(favorites.id, kindOfBlue.id),
        op: "delete",
        data: null,
      }),
      expect.objectContaining({ entity: "position", op: "insert", data: atTop }),
    ]);
    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    expect(snapshot.memberships).toEqual([]);
    expect(snapshot.albums).toEqual([kindOfBlue]);
    expect(snapshot.positions).toEqual([atTop]);
  });

  test("an album in two lists is one record with two entries", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const favorites = await savedList(anna, "Favorites");
    const lateNight = await savedList(anna, "Late night");
    await executeMutation(t.db, anna, addEntry(favorites.id, kindOfBlue.id));
    await executeMutation(t.db, anna, addEntry(lateNight.id, kindOfBlue.id));
    await executeMutation(
      t.db,
      anna,
      retitle(kindOfBlue.id, "Kind of Blue (Legacy)", "Kind of Blue"),
    );

    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    expect(snapshot.albums).toEqual([{ ...kindOfBlue, title: "Kind of Blue (Legacy)" }]);
    expect(snapshot.memberships.map((entry) => entry.listId).toSorted()).toEqual(
      [favorites.id, lateNight.id].toSorted(),
    );
  });

  test("the limit counts entries whose list is in Trash", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const lateNight = await savedList(anna, "Late night");
    // 250 lists of 200 albums: 50,000 entries, made in SQL because one insert can't carry that many parameters.
    await t.db.execute(sql`
      insert into ${albums} (id, owner_id, title, artist_credit, original_year, search_title_key, search_artist_key)
      select gen_random_uuid(), ${anna.userId}, 'Album ' || n, 'Artist', 2000, 'album ' || n, 'artist'
      from generate_series(1, 200) n`);
    await t.db.execute(sql`
      insert into ${containers} (id, owner_id, kind, name, name_key, search_name_key)
      select gen_random_uuid(), ${anna.userId}, 'list', 'Bulk ' || n, 'bulk ' || n, 'bulk ' || n
      from generate_series(1, 250) n`);
    await t.db.execute(sql`
      insert into ${memberships} (list_id, album_id, owner_id)
      select c.id, a.id, ${anna.userId}
      from ${containers} c cross join ${albums} a
      where c.name like 'Bulk %' and a.title like 'Album %'`);
    const [bulk] = await t.db.select().from(containers).where(eq(containers.name, "Bulk 1"));
    if (!bulk) throw new Error("The bulk lists weren't inserted.");
    await trash(anna.userId, bulk.id);
    expect(maxMemberships).toBe(50_000);

    const before = await headSeq(t.db, anna.userId);
    const over = await executeMutation(t.db, anna, addEntry(lateNight.id, kindOfBlue.id));
    expect(over.result.outcome).toMatchObject({ status: "failed", code: "limit_exceeded" });
    expect(await headSeq(t.db, anna.userId)).toBe(before);
  });
});

describe("Unsorted (FR-01.9, FR-01.10, TS-13)", () => {
  test("an album in no list is unsorted, counted and searchable; a list takes it out", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const favorites = await savedList(anna, "Favorites");
    expect(await collectionOverview(t.db, anna.userId)).toMatchObject({ albums: 1, unsorted: 1 });

    await executeMutation(t.db, anna, addEntry(favorites.id, kindOfBlue.id));
    expect(await collectionOverview(t.db, anna.userId)).toMatchObject({ albums: 1, unsorted: 0 });

    await executeMutation(t.db, anna, removeEntry(favorites.id, kindOfBlue.id));
    expect(await collectionOverview(t.db, anna.userId)).toMatchObject({ albums: 1, unsorted: 1 });
    const found = await searchCollection(t.db, {
      ownerId: anna.userId,
      query: "kind of",
      limit: 10,
    });
    expect(found.albums.items.map((match) => match.id)).toEqual([kindOfBlue.id]);
  });

  test("a list in Trash keeps its albums: in their other lists, or in Unsorted", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const blueTrain = await savedAlbum(anna, "Blue Train");
    const favorites = await savedList(anna, "Favorites");
    const lateNight = await savedList(anna, "Late night");
    for (const [list, each] of [
      [favorites, kindOfBlue],
      [lateNight, kindOfBlue],
      [favorites, blueTrain],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await executeMutation(t.db, anna, addEntry(list.id, each.id));
    }
    expect(await collectionOverview(t.db, anna.userId)).toMatchObject({ albums: 2, unsorted: 0 });

    await trash(anna.userId, favorites.id);
    expect(await collectionOverview(t.db, anna.userId)).toMatchObject({ albums: 2, unsorted: 1 });
    const stillListed = await listContainer(t.db, {
      ownerId: anna.userId,
      containerId: lateNight.id,
      limit: 10,
    });
    expect(stillListed.kind === "list" && stillListed.albums.map((each) => each.id)).toEqual([
      kindOfBlue.id,
    ]);
    // The entries stay stored, so recovering the list can restore them (TS-13); clients get the effective one.
    expect(await t.db.select().from(memberships)).toHaveLength(3);
    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    expect(snapshot.memberships).toMatchObject([{ listId: lateNight.id, albumId: kindOfBlue.id }]);
    expect(snapshot.albums).toEqual(expect.arrayContaining([kindOfBlue, blueTrain]));
  });
});

const listItem = (name: string, dependsOn?: string[]): BatchItem => ({
  ...createContainer(node("list", name)),
  ...(dependsOn && { dependsOn }),
});
const batchOf = (...items: BatchItem[]): Batch => ({ batchId: uuidv7(), items });

/** The names of the account's lists, sorted. */
async function listNames(accountId: string): Promise<string[]> {
  const rows = await t.db.select().from(containers).where(eq(containers.ownerId, accountId));
  return rows.map((row) => row.name).toSorted();
}

const setView = (viewKey: string, args: object, base: object): Mutation => ({
  mutationId: uuidv7(),
  name: "view.set",
  args: { viewKey, ...args },
  base,
});

describe("view choices and defaults (FR-05.2, FR-11.7, FR-11.8)", () => {
  test("a choice is logged as a view change and comes back in the bootstrap, for that person only", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    const doom = await savedList(anna, "Doom");
    const mutation = setView(
      doom.id,
      { sortMode: "name", sortDir: "desc" },
      { sortMode: null, sortDir: null },
    );
    const sorted = await executeMutation(t.db, anna, mutation);
    const prefs = {
      viewKey: doom.id,
      sortMode: "name" as const,
      sortDir: "desc" as const,
      grouped: null,
      layout: null,
    };
    expect(sorted.changes).toEqual([
      {
        seq: 2,
        entity: "view",
        id: doom.id,
        op: "insert",
        data: prefs,
        mutationId: mutation.mutationId,
      },
    ]);
    expect(await readChanges(t.db, anna.userId, 1, 10)).toEqual(sorted.changes);

    const grouped = await executeMutation(
      t.db,
      anna,
      setView(doom.id, { grouped: true }, { grouped: null }),
    );
    expect(grouped.changes.map((change) => change.op)).toEqual(["update"]);
    expect((await bootstrapSnapshot(t.db, anna.userId)).views).toEqual([
      { ...prefs, grouped: true },
    ]);
    expect((await bootstrapSnapshot(t.db, ben.userId)).views).toEqual([]);
  });

  test("clearing every choice deletes the row, and a stale choice changes nothing", async () => {
    const anna = await newPrincipal();
    await executeMutation(t.db, anna, setView("unsorted", { layout: "grid" }, { layout: null }));
    const stale = await executeMutation(
      t.db,
      anna,
      setView("unsorted", { layout: "rows" }, { layout: null }),
    );
    expect(stale.result.outcome).toEqual({
      status: "conflict",
      conflicts: [{ field: "layout", current: "grid", attempted: "rows", base: null }],
    });
    const cleared = await executeMutation(
      t.db,
      anna,
      setView("unsorted", { layout: null }, { layout: "grid" }),
    );
    expect(cleared.changes).toEqual([
      expect.objectContaining({ entity: "view", id: "unsorted", op: "delete", data: null }),
    ]);
    expect((await bootstrapSnapshot(t.db, anna.userId)).views).toEqual([]);
  });

  test("defaults are logged complete, and the bootstrap has them complete before and after", async () => {
    const anna = await newPrincipal();
    expect((await bootstrapSnapshot(t.db, anna.userId)).defaults).toEqual(appAccountDefaults);
    const mutation: Mutation = {
      mutationId: uuidv7(),
      name: "defaults.set",
      args: { listSortMode: "name", grouped: true },
      base: { listSortMode: "year", grouped: false },
    };
    const saved = await executeMutation(t.db, anna, mutation);
    const defaults = { ...appAccountDefaults, listSortMode: "name" as const, grouped: true };
    expect(saved.changes).toEqual([
      {
        seq: 1,
        entity: "defaults",
        id: anna.userId,
        op: "update",
        data: defaults,
        mutationId: mutation.mutationId,
      },
    ]);
    const again = await executeMutation(t.db, anna, {
      mutationId: uuidv7(),
      name: "defaults.set",
      args: { layout: "grid" },
      base: { layout: "rows" },
    });
    expect(again.changes[0]?.data).toEqual({ ...defaults, layout: "grid" });
    expect((await bootstrapSnapshot(t.db, anna.userId)).defaults).toEqual({
      ...defaults,
      layout: "grid",
    });
  });

  test("the link setting is saved with the defaults, and each write keeps the other's", async () => {
    const anna = await newPrincipal();
    const linked = await executeMutation(t.db, anna, {
      mutationId: uuidv7(),
      name: "defaults.setLinkTarget",
      args: { linkTarget: "app" },
      base: { linkTarget: "web" },
    });
    expect(linked.changes[0]?.data).toEqual({ ...appAccountDefaults, linkTarget: "app" });
    const grouped = await executeMutation(t.db, anna, {
      mutationId: uuidv7(),
      name: "defaults.set",
      args: { grouped: true },
      base: { grouped: false },
    });
    const defaults = { ...appAccountDefaults, grouped: true, linkTarget: "app" as const };
    expect(grouped.changes[0]?.data).toEqual(defaults);
    expect((await bootstrapSnapshot(t.db, anna.userId)).defaults).toEqual(defaults);
  });
});

const orderSet = (
  viewKey: string,
  keys: Record<string, string | null>,
  base: Record<string, string | null>,
): Mutation => ({ mutationId: uuidv7(), name: "order.set", args: { viewKey, keys }, base });

describe("manual order (TS-16, FR-05.2–FR-05.4)", () => {
  test("a move is logged as position changes, bootstrapped, and a stale one is a conflict", async () => {
    const [anna, ben] = await Promise.all([newPrincipal(), newPrincipal()]);
    const nightfall = await savedAlbum(anna, "Nightfall");
    const dreams = await savedAlbum(anna, "Ancient Dreams");
    const doom = await savedList(anna, "Doom");
    await executeMutation(t.db, anna, addEntry(doom.id, nightfall.id));
    await executeMutation(t.db, anna, addEntry(doom.id, dreams.id));

    const moved = await executeMutation(
      t.db,
      anna,
      orderSet(doom.id, { [dreams.id]: "Zz" }, { [dreams.id]: null }),
    );
    const place = { viewKey: doom.id, itemId: dreams.id, key: "Zz" };
    expect(moved.changes).toEqual([
      expect.objectContaining({
        entity: "position",
        id: `${doom.id}:${dreams.id}`,
        op: "insert",
        data: place,
      }),
    ]);
    expect((await bootstrapSnapshot(t.db, anna.userId)).positions).toEqual([place]);
    expect((await bootstrapSnapshot(t.db, ben.userId)).positions).toEqual([]);

    const stale = await executeMutation(
      t.db,
      anna,
      orderSet(doom.id, { [dreams.id]: "a5" }, { [dreams.id]: null }),
    );
    expect(stale.result.outcome).toEqual({
      status: "conflict",
      conflicts: [{ field: dreams.id, current: "Zz", attempted: "a5", base: null }],
    });
  });

  test("Unsorted holds only albums in no active list, and its top is the bytewise first key", async () => {
    const anna = await newPrincipal();
    const listed = await savedAlbum(anna, "Nightfall");
    const loose = await savedAlbum(anna, "Ancient Dreams");
    const other = await savedAlbum(anna, "Tales of Creation");
    const doom = await savedList(anna, "Doom");
    await executeMutation(t.db, anna, addEntry(doom.id, listed.id));

    const refused = await executeMutation(
      t.db,
      anna,
      orderSet("unsorted", { [listed.id]: "a0" }, { [listed.id]: null }),
    );
    expect(refused.result.outcome).toMatchObject({ status: "failed", code: "not_found" });
    // Bytewise, "Zz" sorts before "a0", so it is the top; a locale's collation would put "a0" first.
    await executeMutation(
      t.db,
      anna,
      orderSet(
        "unsorted",
        { [loose.id]: "a0", [other.id]: "Zz" },
        { [loose.id]: null, [other.id]: null },
      ),
    );
    // A new album enters the arranged Unsorted above the bytewise first key.
    const created = await executeMutation(t.db, anna, create());
    const entered = created.changes.find((change) => change.entity === "position");
    expect(entered?.data).toMatchObject({ viewKey: "unsorted" });
    const key = entered?.data && "key" in entered.data ? entered.data.key : "";
    expect(key < "Zz").toBe(true);
  });

  test("joining a list forgets the Unsorted place, and a moved list forgets its place at the root", async () => {
    const anna = await newPrincipal();
    const nightfall = await savedAlbum(anna, "Nightfall");
    const doom = await savedList(anna, "Doom");
    const metal = await savedFolder(anna, "Metal");
    await executeMutation(
      t.db,
      anna,
      orderSet("unsorted", { [nightfall.id]: "a0" }, { [nightfall.id]: null }),
    );
    await executeMutation(t.db, anna, orderSet("root", { [doom.id]: "a0" }, { [doom.id]: null }));

    const added = await executeMutation(t.db, anna, addEntry(doom.id, nightfall.id));
    expect(added.changes.map((change) => [change.entity, change.op])).toEqual([
      ["membership", "insert"],
      ["position", "delete"],
    ]);
    const moved = await executeMutation(t.db, anna, {
      mutationId: uuidv7(),
      name: "container.move",
      args: { id: doom.id, parentId: metal.id },
      base: { parentId: null },
    });
    expect(moved.changes.map((change) => [change.entity, change.id])).toEqual([
      ["container", doom.id],
      ["position", `root:${doom.id}`],
    ]);
    expect((await bootstrapSnapshot(t.db, anna.userId)).positions).toEqual([]);
  });
});

describe("executeBatch (TS-25, FR-13.4)", () => {
  test("keeps the successes around a failed item, each committed on its own", async () => {
    const anna = await newPrincipal();
    await savedList(anna, "Taken");
    const result = await executeBatch(
      t.db,
      anna,
      batchOf(listItem("First"), listItem("taken"), listItem("Third")),
    );
    expect(result.items.map(({ outcome }) => outcome)).toEqual([
      { status: "confirmed", seq: 2, result: null },
      expect.objectContaining({ status: "failed", code: "name_conflict" }),
      { status: "confirmed", seq: 3, result: null },
    ]);
    expect(await listNames(anna.userId)).toEqual(["First", "Taken", "Third"]);
  });

  test("at the album limit, each new album is refused with the reason, and list and link adds go through (AC-32)", async () => {
    const anna = await newPrincipal();
    const doom = await savedList(anna, "Doom");
    const kept = await savedAlbum(anna, "Dopesmoker");
    // The rest of the 5,000, written straight in, a thousand rows at a time.
    const rest = Array.from({ length: maxAlbums - 1 }, (_, index) => ({
      id: uuidv7(),
      ownerId: anna.userId,
      title: `Album ${index}`,
      artistCredit: "Sleep",
      originalYear: 1999,
      searchTitleKey: `album ${index}`,
      searchArtistKey: "sleep",
    }));
    for (let start = 0; start < rest.length; start += 1_000) {
      // oxlint-disable-next-line no-await-in-loop -- one chunk after another
      await t.db.insert(albums).values(rest.slice(start, start + 1_000));
    }

    const spotify = {
      service: "spotify" as const,
      url: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
      entityId: "1KQ1Pf4ikoK1jBbOtOHvOv",
    };
    const result = await executeBatch(
      t.db,
      anna,
      batchOf(
        create(album({ title: "One more" })),
        addEntry(doom.id, kept.id),
        create(album({ title: "And another" })),
        {
          mutationId: uuidv7(),
          name: "link.set",
          args: { albumId: kept.id, service: "spotify", url: spotify.url },
          base: { url: null },
        },
      ),
      {
        // The API reads a link before it runs (TS-40).
        execute: (mutation) =>
          executeMutation(
            t.db,
            anna,
            mutation,
            undefined,
            mutation.name === "link.set" ? { link: { status: "parsed", link: spotify } } : {},
          ),
      },
    );
    const refused = expect.objectContaining({
      status: "failed",
      code: "capacity_exceeded",
      problem: expect.objectContaining({
        detail:
          "You've reached 5,000 albums (including Trash). Permanently delete albums from Trash or remove albums to add more.",
      }),
    });
    expect(result.items.map(({ outcome }) => outcome)).toEqual([
      refused,
      expect.objectContaining({ status: "confirmed" }),
      refused,
      expect.objectContaining({ status: "confirmed" }),
    ]);
    const [{ count } = { count: 0 }] = await t.db
      .select({ count: sql<number>`count(*)::int` })
      .from(albums)
      .where(eq(albums.ownerId, anna.userId));
    expect(count).toBe(maxAlbums);
  });

  test("skips the dependent of a failed item without using a seq, and records neither", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const list = node("list", "  ");
    const blank: BatchItem = createContainer(list);
    const addition: BatchItem = {
      ...addEntry(list.id, kindOfBlue.id),
      dependsOn: [blank.mutationId],
    };

    const result = await executeBatch(t.db, anna, batchOf(blank, addition));
    expect(result.items[1]?.outcome).toEqual({
      status: "skipped",
      dependsOn: blank.mutationId,
      because: "failed",
    });
    expect(await headSeq(t.db, anna.userId)).toBe(1);
    expect(await findMutationResult(t.db, anna.userId, addition.mutationId)).toBeUndefined();
  });

  test("hands over each item's changes as it commits, in seq order", async () => {
    const anna = await newPrincipal();
    const kindOfBlue = await savedAlbum(anna, "Kind of Blue");
    const list = node("list", "Favorites");
    const creation: BatchItem = createContainer(list);
    const add: BatchItem = {
      ...addEntry(list.id, kindOfBlue.id),
      dependsOn: [creation.mutationId],
    };
    const handed: Change[][] = [];

    await executeBatch(t.db, anna, batchOf(creation, add, listItem("Later")), {
      onExecuted: (changes) => handed.push(changes),
    });
    expect(handed.map((changes) => changes.map((change) => [change.seq, change.entity]))).toEqual([
      [[2, "container"]],
      [[3, "membership"]],
      [[4, "container"]],
    ]);
  });

  test("a batch sent again applies nothing twice, and runs what didn't run", async () => {
    const anna = await newPrincipal();
    const first = listItem("First");
    const blocked = listItem("Blocked", [first.mutationId]);
    // The first attempt got as far as the first item.
    const partial = await executeMutation(t.db, anna, first);
    const sent = batchOf(first, blocked);

    const again = await executeBatch(t.db, anna, sent);
    expect(again.items.map(({ outcome }) => outcome)).toEqual([
      partial.result.outcome,
      { status: "confirmed", seq: 2, result: null },
    ]);
    const thirdTime = await executeBatch(t.db, anna, sent);
    expect(thirdTime).toEqual(again);
    expect(await listNames(anna.userId)).toEqual(["Blocked", "First"]);
    expect(await headSeq(t.db, anna.userId)).toBe(2);
  });

  test("two copies of a batch at once apply each item once, and answer alike", async () => {
    const anna = await newPrincipal();
    const first = listItem("First");
    const sent = batchOf(first, listItem("Second", [first.mutationId]), listItem("Third"));
    const [one, two] = await Promise.all([
      executeBatch(t.db, anna, sent),
      executeBatch(t.db, anna, sent),
    ]);
    expect(two).toEqual(one);
    expect(one.items.every(({ outcome }) => outcome.status === "confirmed")).toBe(true);
    expect(await listNames(anna.userId)).toEqual(["First", "Second", "Third"]);
    expect(await changeCount(anna.userId)).toBe(3);
  });
});
