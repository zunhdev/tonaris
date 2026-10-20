// The sync protocol's storage against the local Postgres 18 (TS-20–TS-24, TS-121): the write lock, gapless
// `seq`, idempotent replay, rejections that change nothing, and a bootstrap snapshot consistent with its `seq`.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import {
  syncRetentionMs,
  uuidv7,
  type Album,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import {
  accountSync,
  albums,
  changeLog,
  containers,
  memberships,
  mutations,
  users,
} from "./schema";
import {
  bootstrapSnapshot,
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
  ...values,
});

const create = (args: Album = album()): Mutation => ({
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
  return { id, ownerId, kind, parentId, name, nameKey: name.toLowerCase() };
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
        { id: folderId, kind: "folder" as const, parentId: null, name: "Jazz" },
        { id: listId, kind: "list" as const, parentId: folderId, name: "Hard bop" },
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
