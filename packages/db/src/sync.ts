// The sync protocol's storage (TS-20–TS-24): running a mutation under the owner's write lock, reading the
// change log after a cursor, and the bootstrap snapshot. Commands come from packages/domain; this module
// gives them a store on the transaction and records what they did.

import { and, asc, count, eq, gt, isNull, lt, sql } from "drizzle-orm";

import {
  actingUserId,
  changeSchema,
  outcomeSchema,
  runCommand,
  syncRetentionMs,
  uuidv7Time,
  failure,
  maxContainerDepth,
  nameKey,
  searchKey,
  type Album,
  type Bootstrap,
  type Change,
  type CollectionStore,
  type Container,
  type Membership,
  type Mutation,
  type MutationResult,
  type Outcome,
  type Principal,
} from "@tonaris/domain";

import type { Database } from "./client";
import { accountSync, albums, changeLog, containers, memberships, mutations } from "./schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const albumColumns = {
  id: albums.id,
  title: albums.title,
  artistCredit: albums.artistCredit,
  releaseType: albums.releaseType,
  isLive: albums.isLive,
  originalYear: albums.originalYear,
  recordingYearStart: albums.recordingYearStart,
  recordingYearEnd: albums.recordingYearEnd,
};

const containerColumns = {
  id: containers.id,
  kind: containers.kind,
  parentId: containers.parentId,
  name: containers.name,
};

const membershipColumns = {
  listId: memberships.listId,
  albumId: memberships.albumId,
  addedAt: memberships.addedAt,
};

/** An entry as clients see it, with `addedAt` as the ISO string the protocol carries. */
const membershipOf = (row: Omit<Membership, "addedAt"> & { addedAt: Date }): Membership => ({
  ...row,
  addedAt: row.addedAt.toISOString(),
});

/**
 * The domain's store on one transaction. Search and name keys are derived here, so every write keeps them
 * (TS-12). The hierarchy is walked with recursive CTEs (TS-31), cut off past the depth limit so that even a
 * cycle in damaged data can't run away.
 */
function collectionStore(tx: Transaction): CollectionStore {
  return {
    async findAlbum(id) {
      const [row] = await tx
        .select({ ...albumColumns, ownerId: albums.ownerId, trashedAt: albums.trashedAt })
        .from(albums)
        .where(eq(albums.id, id));
      if (!row) return undefined;
      const { trashedAt, ...album } = row;
      return { ...album, trashed: trashedAt !== null };
    },
    async insertAlbum(album) {
      await tx.insert(albums).values({
        ...album,
        searchTitleKey: searchKey(album.title),
        searchArtistKey: searchKey(album.artistCredit),
      });
    },
    async updateAlbum(id, values) {
      await tx
        .update(albums)
        .set({
          ...values,
          ...(values.title === undefined ? {} : { searchTitleKey: searchKey(values.title) }),
          ...(values.artistCredit === undefined
            ? {}
            : { searchArtistKey: searchKey(values.artistCredit) }),
        })
        .where(eq(albums.id, id));
    },

    async findContainer(id) {
      const [row] = await tx
        .select({
          ...containerColumns,
          ownerId: containers.ownerId,
          trashedAt: containers.trashedAt,
        })
        .from(containers)
        .where(eq(containers.id, id));
      if (!row) return undefined;
      const { trashedAt, ...container } = row;
      return { ...container, trashed: trashedAt !== null };
    },
    async containerPath(id) {
      const rows = await tx.execute<{ id: string }>(sql`
        with recursive path (id, parent_id, level) as (
          select id, parent_id, 1 from ${containers} where id = ${id}
          union all
          select c.id, c.parent_id, path.level + 1
          from ${containers} c join path on c.id = path.parent_id
          where path.level <= ${maxContainerDepth}
        )
        select id from path order by level`);
      return rows.map((row) => row.id);
    },
    async subtreeDepth(id) {
      const [row] = await tx.execute<{ depth: number | null }>(sql`
        with recursive tree (id, level) as (
          select id, 1 from ${containers} where id = ${id} and trashed_at is null
          union all
          select c.id, tree.level + 1
          from ${containers} c join tree on c.parent_id = tree.id
          where c.trashed_at is null and tree.level <= ${maxContainerDepth}
        )
        select max(level)::int as depth from tree`);
      return row?.depth ?? 0;
    },
    activeChildren(ownerId, parentId) {
      return tx
        .select(containerColumns)
        .from(containers)
        .where(
          and(
            eq(containers.ownerId, ownerId),
            parentId === null ? isNull(containers.parentId) : eq(containers.parentId, parentId),
            isNull(containers.trashedAt),
          ),
        );
    },
    async countContainers(ownerId) {
      const [row] = await tx
        .select({ count: count() })
        .from(containers)
        .where(eq(containers.ownerId, ownerId));
      return row?.count ?? 0;
    },
    async insertContainer(container) {
      await tx.insert(containers).values({ ...container, nameKey: nameKey(container.name) });
    },
    async updateContainer(id, values) {
      await tx
        .update(containers)
        .set({
          ...values,
          ...(values.name === undefined ? {} : { nameKey: nameKey(values.name) }),
        })
        .where(eq(containers.id, id));
    },

    async findMembership(listId, albumId) {
      const [row] = await tx
        .select(membershipColumns)
        .from(memberships)
        .where(and(eq(memberships.listId, listId), eq(memberships.albumId, albumId)));
      return row && membershipOf(row);
    },
    async countMemberships(ownerId) {
      const [row] = await tx
        .select({ count: count() })
        .from(memberships)
        .where(eq(memberships.ownerId, ownerId));
      return row?.count ?? 0;
    },
    async insertMembership({ addedAt, ...membership }) {
      await tx.insert(memberships).values({ ...membership, addedAt: new Date(addedAt) });
    },
    async deleteMembership(listId, albumId) {
      await tx
        .delete(memberships)
        .where(and(eq(memberships.listId, listId), eq(memberships.albumId, albumId)));
    },
  };
}

/** How the `mutations` table names who sent a mutation (TS-11). */
function principalLabel(principal: Principal): string {
  if (principal.kind === "mcp") return `mcp:${principal.grantId}`;
  if (principal.kind === "guest") return `guest:${principal.linkId}`;
  return `user:${principal.client}`;
}

export type ExecutedMutation = {
  result: MutationResult;
  /** The changes it committed, in `seq` order, for the stream. Empty for rejections and replays. */
  changes: Change[];
  /** Whether the outcome is the stored one of an earlier copy of this mutation (TS-22). */
  replayed: boolean;
};

/**
 * Runs one mutation for the account `principal` acts for (TS-20 steps 2–5), in one transaction:
 *
 * 1. Lock the account's `account_sync` row. Every write of the account waits here, so commit order is `seq`
 *    order, and a copy of a mutation that is still running waits for it and then finds its outcome.
 * 2. Replay a stored outcome for a known `mutationId`; refuse one too old to have a record any more (`expired`).
 * 3. Run the command. If it applied changes, advance `seq` by one per change and log each change at its `seq`,
 *    so the log has no gaps and a rejection or replay uses no `seq`.
 * 4. Record the outcome under `mutationId`, whatever it is, so every retry gets the same answer (FR-13.5).
 */
export async function executeMutation(
  db: Database,
  principal: Principal,
  mutation: Mutation,
  now: Date = new Date(),
): Promise<ExecutedMutation> {
  const accountId = actingUserId(principal);
  const { mutationId } = mutation;
  const answer = (outcome: Outcome, changes: Change[] = [], replayed = false) => ({
    result: { mutationId, outcome },
    changes,
    replayed,
  });
  if (!accountId) return answer(failure("permission_denied", "Guests can't change anything."));

  return db.transaction(async (tx) => {
    await tx.insert(accountSync).values({ accountId }).onConflictDoNothing();
    const [lock] = await tx
      .select({ seq: accountSync.seq })
      .from(accountSync)
      .where(eq(accountSync.accountId, accountId))
      .for("update");
    const seq = lock?.seq ?? 0;

    const [stored] = await tx
      .select({ accountId: mutations.accountId, result: mutations.result })
      .from(mutations)
      .where(eq(mutations.id, mutationId));
    if (stored) {
      if (stored.accountId !== accountId || !stored.result) {
        return answer(
          failure("validation_failed", "This mutation ID is already in use.", [
            { path: "mutationId", message: "Already in use" },
          ]),
        );
      }
      return answer(outcomeSchema.parse(stored.result), [], true);
    }
    const madeAt = uuidv7Time(mutationId) ?? now.getTime();
    if (madeAt < now.getTime() - syncRetentionMs) {
      return answer(
        failure(
          "expired",
          "This change is too old to be retried. Check the saved state and make it again.",
        ),
      );
    }

    const result = await runCommand(mutation, { principal, store: collectionStore(tx), now });
    let changes: Change[] = [];
    const reported = result.status === "applied" ? (result.result ?? null) : null;
    let outcome: Outcome =
      result.status === "applied" ? { status: "confirmed", seq, result: reported } : result;
    if (result.status === "applied" && result.changes.length > 0) {
      changes = result.changes.map((change, index) =>
        Object.assign({ seq: seq + index + 1, mutationId }, change),
      );
      const last = seq + changes.length;
      await tx.update(accountSync).set({ seq: last }).where(eq(accountSync.accountId, accountId));
      await tx.insert(changeLog).values(
        changes.map((change) => ({
          accountId,
          seq: change.seq,
          entity: change.entity,
          entityId: change.id,
          op: change.op,
          data: change.data,
          mutationId,
        })),
      );
      outcome = { status: "confirmed", seq: last, result: reported };
    }

    await tx.insert(mutations).values({
      id: mutationId,
      accountId,
      principal: principalLabel(principal),
      name: mutation.name,
      status: outcome.status,
      result: outcome,
      receivedAt: now,
      completedAt: new Date(),
    });
    return answer(outcome, changes);
  });
}

/** A mutation's stored result, for the account that sent it (`GET /v1/mutations/{id}`, TS-22). */
export async function findMutationResult(
  db: Database,
  accountId: string,
  mutationId: string,
): Promise<MutationResult | undefined> {
  const [stored] = await db
    .select({ result: mutations.result })
    .from(mutations)
    .where(and(eq(mutations.id, mutationId), eq(mutations.accountId, accountId)));
  return stored?.result ? { mutationId, outcome: outcomeSchema.parse(stored.result) } : undefined;
}

/** The account's latest `seq`: 0 before its first change. */
export async function headSeq(db: Database, accountId: string): Promise<number> {
  const [row] = await db
    .select({ seq: accountSync.seq })
    .from(accountSync)
    .where(eq(accountSync.accountId, accountId));
  return row?.seq ?? 0;
}

/** Up to `limit` of the account's changes after `seq`, in order (TS-23). */
export async function readChanges(
  db: Database,
  accountId: string,
  after: number,
  limit: number,
): Promise<Change[]> {
  const rows = await db
    .select({
      seq: changeLog.seq,
      entity: changeLog.entity,
      id: changeLog.entityId,
      op: changeLog.op,
      data: changeLog.data,
      mutationId: changeLog.mutationId,
    })
    .from(changeLog)
    .where(and(eq(changeLog.accountId, accountId), gt(changeLog.seq, after)))
    .orderBy(asc(changeLog.seq))
    .limit(limit);
  // The log holds what executeMutation wrote; reading it back through the schema keeps the stream honest.
  return rows.map((row) => changeSchema.parse(row));
}

/**
 * The account's collection and the `seq` it is current at (TS-24), from one snapshot: a write commits its
 * records and its `seq` together, so the snapshot sees both or neither. Trashed records come too, marked by
 * nothing yet: Trash arrives with M5, and its views filter them.
 */
export function bootstrapSnapshot(db: Database, accountId: string): Promise<Bootstrap> {
  return db.transaction(
    async (tx) => {
      const [sync] = await tx
        .select({ seq: accountSync.seq })
        .from(accountSync)
        .where(eq(accountSync.accountId, accountId));
      const owned: Album[] = await tx
        .select(albumColumns)
        .from(albums)
        .where(eq(albums.ownerId, accountId))
        .orderBy(asc(albums.id));
      const folders: Container[] = await tx
        .select(containerColumns)
        .from(containers)
        .where(eq(containers.ownerId, accountId))
        .orderBy(asc(containers.id));
      const entries = await tx
        .select(membershipColumns)
        .from(memberships)
        .where(eq(memberships.ownerId, accountId))
        .orderBy(asc(memberships.listId), asc(memberships.albumId));
      return {
        seq: sync?.seq ?? 0,
        albums: owned,
        containers: folders,
        memberships: entries.map(membershipOf),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * Removes change-log entries and idempotency records older than the retention window (TS-22, TS-23). A stream
 * cursor before the remaining log is then answered with `reset`, and a replay of a removed mutation is `expired`.
 */
export async function pruneSyncHistory(db: Database, now: Date = new Date()): Promise<void> {
  const before = new Date(now.getTime() - syncRetentionMs);
  await db.delete(changeLog).where(lt(changeLog.createdAt, before));
  await db.delete(mutations).where(lt(mutations.receivedAt, before));
}
