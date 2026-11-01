// The sync protocol's storage (TS-20–TS-24): running a mutation under the owner's write lock, reading the
// change log after a cursor, and the bootstrap snapshot, with the daily pruning and the hourly Trash expiry (TS-91).
// Commands come from packages/domain and run on the store in store/; this module records what they did.

import { and, asc, desc, eq, gt, isNull, lt, lte } from "drizzle-orm";

import {
  actingUserId,
  appAccountDefaults,
  changeSchema,
  guestMutationRefusal,
  mutationIdInUse,
  mutationTooOld,
  outcomeSchema,
  purgeUnit,
  runBatch,
  runCommand,
  syncRetentionMs,
  type AccountDefaults,
  type Album,
  type Batch,
  type BatchResult,
  type Bootstrap,
  type CaptureSource,
  type Change,
  type ChangeInput,
  type Container,
  type Failure,
  type Mutation,
  type MutationResult,
  type Outcome,
  type Position,
  type PreparedLink,
  type Principal,
  type ServiceLink,
  type ViewPrefs,
} from "@tonaris/domain";

import { readSnapshot, type Database, type Executor, type Transaction } from "./client";
import {
  accountDefaultsColumns,
  albumColumns,
  containerColumns,
  membershipColumns,
  membershipOf,
  positionColumns,
  unitsOfAccount,
  viewPrefsColumns,
  serviceLinkColumns,
  storedUnitColumns,
} from "./columns";
import { fieldsOfAccount, valuesOfAccount } from "./field-values";
import {
  accountSettings,
  accountSync,
  approvals,
  albumServiceLinks,
  albums,
  changeLog,
  mcpOperations,
  containers,
  memberships,
  mutations,
  positions,
  savedReferences,
  trashUnits,
  viewPrefs,
} from "./schema";
import { collectionStore } from "./store";

/**
 * Takes the account's write lock (TS-20): its `account_sync` row, for the rest of the transaction. Every write of
 * the account waits here, so commit order is `seq` order. Answers the account's `seq` before this write.
 */
export async function lockAccount(tx: Transaction, accountId: string): Promise<number> {
  await tx.insert(accountSync).values({ accountId }).onConflictDoNothing();
  const [lock] = await tx
    .select({ seq: accountSync.seq })
    .from(accountSync)
    .where(eq(accountSync.accountId, accountId))
    .for("update");
  return lock?.seq ?? 0;
}

/**
 * Logs `inputs` at the `seq`s after `seq`, one each, and advances the account's `seq` past them, under the lock
 * `lockAccount` took. `mutationId` is the mutation that made them, or null for the system's own writes, such as
 * enrichment. Answers the changes as the stream carries them.
 */
export async function logChanges(
  tx: Transaction,
  accountId: string,
  seq: number,
  inputs: readonly ChangeInput[],
  mutationId: string | null,
): Promise<Change[]> {
  const changes = inputs.map((change, index) =>
    Object.assign({ seq: seq + index + 1, mutationId }, change),
  );
  await tx
    .update(accountSync)
    .set({ seq: seq + changes.length })
    .where(eq(accountSync.accountId, accountId));
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
  return changes;
}

/** How the `mutations` table names who sent a mutation (TS-11). */
function principalLabel(principal: Principal): string {
  if (principal.kind === "mcp") return `mcp:${principal.grantId}`;
  if (principal.kind === "guest") return `guest:${principal.linkId}`;
  return `user:${principal.client}`;
}

/** A mutation's row: whose it is, its outcome once it has one, and when it was received or last claimed. */
type StoredMutation = { accountId: string; result: unknown; receivedAt: Date };

/** The row stored under the mutation ID `id`, if any (TS-22). */
async function storedMutation(tx: Transaction, id: string): Promise<StoredMutation | undefined> {
  const [stored] = await tx
    .select({
      accountId: mutations.accountId,
      result: mutations.result,
      receivedAt: mutations.receivedAt,
    })
    .from(mutations)
    .where(eq(mutations.id, id));
  return stored;
}

/**
 * What running and claiming a mutation start with (TS-20 steps 2–3): a guest's is `refused`; anyone else's runs `then`
 * in one transaction under the write lock of the account it acts for, with its `seq` and the mutation's stored row.
 */
function underLock<T>(
  db: Executor,
  principal: Principal,
  mutationId: string,
  refused: (failure: Failure) => T,
  then: (locked: {
    tx: Transaction;
    accountId: string;
    seq: number;
    stored: StoredMutation | undefined;
  }) => Promise<T>,
): Promise<T> {
  const accountId = actingUserId(principal);
  if (!accountId) return Promise.resolve(refused(guestMutationRefusal));
  return db.transaction(async (tx) => {
    const seq = await lockAccount(tx, accountId);
    return then({ tx, accountId, seq, stored: await storedMutation(tx, mutationId) });
  });
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
 *
 * Given a transaction, it runs as a savepoint inside it, so a gated MCP batch commits with the approval it uses, or
 * not at all (TS-64).
 *
 * A mutation `claimMutation()` claimed, such as a capture whose providers ran outside the lock, passes `claimed`, and
 * its claim's row takes the outcome. `capture` is what the API found for an `album.capture`, and `link` how it read a
 * `link.set`'s URL.
 */
export async function executeMutation(
  db: Executor,
  principal: Principal,
  mutation: Mutation,
  now: Date = new Date(),
  {
    claimed = false,
    capture,
    link,
    shareLink,
  }: {
    claimed?: boolean;
    capture?: CaptureSource;
    link?: PreparedLink;
    shareLink?: { hash: Uint8Array };
  } = {},
): Promise<ExecutedMutation> {
  const { mutationId } = mutation;
  const answer = (outcome: Outcome, changes: Change[] = [], replayed = false) => ({
    result: { mutationId, outcome },
    changes,
    replayed,
  });

  return underLock(db, principal, mutationId, answer, async ({ tx, accountId, seq, stored }) => {
    if (stored?.result && stored.accountId === accountId) {
      return answer(outcomeSchema.parse(stored.result), [], true);
    }
    if (stored && (stored.accountId !== accountId || !claimed)) return answer(mutationIdInUse);
    const tooOld = mutationTooOld(mutationId, now);
    if (tooOld) return answer(tooOld);

    const result = await runCommand(mutation, {
      principal,
      store: collectionStore(tx),
      now,
      ...(capture ? { capture } : {}),
      ...(link ? { link } : {}),
      ...(shareLink ? { shareLink } : {}),
    });
    let changes: Change[] = [];
    const reported = result.status === "applied" ? (result.result ?? null) : null;
    let outcome: Outcome =
      result.status === "applied" ? { status: "confirmed", seq, result: reported } : result;
    if (result.status === "applied" && result.changes.length > 0) {
      changes = await logChanges(tx, accountId, seq, result.changes, mutationId);
      outcome = { status: "confirmed", seq: seq + changes.length, result: reported };
    }

    await recordOutcome(tx, accountId, principal, mutation, outcome, now);
    return answer(outcome, changes);
  });
}

/** Stores `outcome` under the mutation's ID, completing its claim if it has one. */
async function recordOutcome(
  tx: Transaction,
  accountId: string,
  principal: Principal,
  mutation: Mutation,
  outcome: Outcome,
  receivedAt: Date,
): Promise<void> {
  const completedAt = new Date();
  await tx
    .insert(mutations)
    .values({
      id: mutation.mutationId,
      accountId,
      principal: principalLabel(principal),
      name: mutation.name,
      status: outcome.status,
      result: outcome,
      receivedAt,
      completedAt,
    })
    .onConflictDoUpdate({
      target: mutations.id,
      set: { status: outcome.status, result: outcome, completedAt },
      setWhere: isNull(mutations.result),
    });
}

/** How long a claim holds before it counts as abandoned, and the mutation runs again (TS-22). */
export const claimTimeoutMs = 5 * 60_000;

/** What `claimMutation()` found: run it now, it is running elsewhere, or it is already answered. */
export type Claim =
  | { status: "claimed" }
  | { status: "in_progress" }
  | { status: "answered"; executed: ExecutedMutation };

/**
 * Claims a mutation that waits on providers before taking the write lock, such as a capture (TS-22): a stored outcome
 * is replayed, a claim made under `claimTimeoutMs` ago is in progress, and otherwise a row with no outcome is
 * recorded, or an abandoned one refreshed. The claimer then finishes it with `executeMutation(…, { claimed })` or
 * `finishMutation()`. Refusals that need no providers, such as an expired retry, are answered here.
 */
export async function claimMutation(
  db: Database,
  principal: Principal,
  mutation: Mutation,
  now: Date = new Date(),
): Promise<Claim> {
  const { mutationId } = mutation;
  const answered = (outcome: Outcome, replayed = false): Claim => ({
    status: "answered",
    executed: { result: { mutationId, outcome }, changes: [], replayed },
  });

  return underLock(db, principal, mutationId, answered, async ({ tx, accountId, stored }) => {
    if (stored) {
      if (stored.accountId !== accountId) return answered(mutationIdInUse);
      if (stored.result) return answered(outcomeSchema.parse(stored.result), true);
      if (stored.receivedAt.getTime() > now.getTime() - claimTimeoutMs) {
        return { status: "in_progress" };
      }
      await tx.update(mutations).set({ receivedAt: now }).where(eq(mutations.id, mutationId));
      return { status: "claimed" };
    }
    const tooOld = mutationTooOld(mutationId, now);
    if (tooOld) return answered(tooOld);
    await tx.insert(mutations).values({
      id: mutationId,
      accountId,
      principal: principalLabel(principal),
      name: mutation.name,
      status: "running",
      result: null,
      receivedAt: now,
    });
    return { status: "claimed" };
  });
}

/** Stores the outcome of a claimed mutation decided before the lock, such as a link that needs details. */
export async function finishMutation(
  db: Database,
  principal: Principal,
  mutation: Mutation,
  outcome: Outcome,
  now: Date = new Date(),
): Promise<ExecutedMutation> {
  const accountId = actingUserId(principal);
  if (accountId) {
    await db.transaction((tx) => recordOutcome(tx, accountId, principal, mutation, outcome, now));
  }
  return { result: { mutationId: mutation.mutationId, outcome }, changes: [], replayed: false };
}

/** Gives a claim up without an outcome, after an unexpected failure, so sending the mutation again runs it. */
export async function releaseClaim(
  db: Database,
  principal: Principal,
  mutationId: string,
): Promise<void> {
  const accountId = actingUserId(principal);
  if (!accountId) return;
  await db
    .delete(mutations)
    .where(
      and(
        eq(mutations.id, mutationId),
        eq(mutations.accountId, accountId),
        isNull(mutations.result),
      ),
    );
}

/** Whether the account's mutation is claimed and still running, for `GET /v1/mutations/{id}` (TS-22). */
export async function mutationRunning(
  db: Database,
  accountId: string,
  mutationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select({ receivedAt: mutations.receivedAt })
    .from(mutations)
    .where(
      and(
        eq(mutations.id, mutationId),
        eq(mutations.accountId, accountId),
        isNull(mutations.result),
      ),
    );
  return row !== undefined && row.receivedAt.getTime() > now.getTime() - claimTimeoutMs;
}

/**
 * Runs a batch's items in order (TS-25), each as its own `executeMutation`: its own transaction, under the
 * owner's write lock, so a success stays committed whatever happens to later items. `onExecuted` gets each item's
 * changes as soon as it commits, for the stream. Each item takes the time it runs at, unless `now` is given.
 * `execute` replaces `executeMutation` per item, as the API's does to run captures with their providers.
 */
export function executeBatch(
  db: Executor,
  principal: Principal,
  batch: Batch,
  {
    now,
    onExecuted = () => {},
    execute = (mutation) => executeMutation(db, principal, mutation, now),
  }: {
    now?: Date;
    onExecuted?: (changes: Change[]) => void;
    /** Runs one item; the API's runs captures with their providers first. */
    execute?: (mutation: Mutation) => Promise<ExecutedMutation>;
  } = {},
): Promise<BatchResult> {
  return runBatch(batch, async (mutation) => {
    const { result, changes } = await execute(mutation);
    onExecuted(changes);
    return result.outcome;
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
 * The account's collection, its view choices, manual order and defaults, and the `seq` they are current at (TS-24),
 * from one snapshot: a write commits its records and its `seq` together, so the snapshot sees both or neither.
 * Albums, folders and lists come active only, with the entries joining an active list and an active album: clients
 * hold active content, and Trash comes as units (TS-13). Links and field values of albums in Trash still come.
 */
export function bootstrapSnapshot(db: Database, accountId: string): Promise<Bootstrap> {
  return readSnapshot(db, async (tx) => {
    const [sync] = await tx
      .select({ seq: accountSync.seq })
      .from(accountSync)
      .where(eq(accountSync.accountId, accountId));
    const owned: Album[] = await tx
      .select(albumColumns)
      .from(albums)
      .where(and(eq(albums.ownerId, accountId), isNull(albums.trashedAt)))
      .orderBy(asc(albums.id));
    const folders: Container[] = await tx
      .select(containerColumns)
      .from(containers)
      .where(and(eq(containers.ownerId, accountId), isNull(containers.trashedAt)))
      .orderBy(asc(containers.id));
    // Only an entry of an active list and an active album is effective (TS-13).
    const entries = await tx
      .select(membershipColumns)
      .from(memberships)
      .innerJoin(containers, eq(containers.id, memberships.listId))
      .innerJoin(albums, eq(albums.id, memberships.albumId))
      .where(
        and(
          eq(memberships.ownerId, accountId),
          isNull(containers.trashedAt),
          isNull(albums.trashedAt),
        ),
      )
      .orderBy(asc(memberships.listId), asc(memberships.albumId));
    const trash = await unitsOfAccount(tx, accountId);
    const fields = await fieldsOfAccount(tx, accountId);
    const fieldValues = await valuesOfAccount(tx, accountId);
    const links: ServiceLink[] = await tx
      .select({ albumId: albumServiceLinks.albumId, ...serviceLinkColumns })
      .from(albumServiceLinks)
      .where(eq(albumServiceLinks.ownerId, accountId))
      .orderBy(asc(albumServiceLinks.albumId), asc(albumServiceLinks.service));
    const views: ViewPrefs[] = await tx
      .select(viewPrefsColumns)
      .from(viewPrefs)
      .where(eq(viewPrefs.personId, accountId))
      .orderBy(asc(viewPrefs.viewKey));
    const arranged: Position[] = await tx
      .select(positionColumns)
      .from(positions)
      .where(eq(positions.personId, accountId))
      .orderBy(asc(positions.viewKey), asc(positions.itemId));
    const [defaults]: AccountDefaults[] = await tx
      .select(accountDefaultsColumns)
      .from(accountSettings)
      .where(eq(accountSettings.accountId, accountId));
    const references = await tx
      .select({ containerId: savedReferences.containerId })
      .from(savedReferences)
      .where(eq(savedReferences.viewerId, accountId))
      .orderBy(desc(savedReferences.createdAt), asc(savedReferences.containerId));
    return {
      seq: sync?.seq ?? 0,
      albums: owned,
      containers: folders,
      memberships: entries.map(membershipOf),
      links,
      fields,
      fieldValues,
      views,
      positions: arranged,
      defaults: defaults ?? appAccountDefaults,
      trashUnits: trash,
      references,
    };
  });
}

/**
 * Removes change-log entries and idempotency records older than the retention window (TS-22, TS-23). A stream
 * cursor before the remaining log is then answered with `reset`, and a replay of a removed mutation is `expired`.
 * The daily schedule runs it in its own transaction (TS-91).
 */
export async function pruneSyncHistory(db: Executor, now: Date = new Date()): Promise<void> {
  const before = new Date(now.getTime() - syncRetentionMs);
  await db.delete(changeLog).where(lt(changeLog.createdAt, before));
  await db.delete(mutations).where(lt(mutations.receivedAt, before));
  // Approvals answer within 30 minutes, and their rows go a retention period after (TS-64).
  await db.delete(approvals).where(lt(approvals.expiresAt, before));
  // An agent's key replays only while its mutations are kept (TS-22).
  await db.delete(mcpOperations).where(lt(mcpOperations.createdAt, before));
}

/**
 * The hourly Trash expiry (TS-91, FR-01.17, FR-14.5): every unit past its expiry is purged, one owner at a time,
 * under the owner's write lock, with its changes logged without a mutation. Answers each owner's changes, for the
 * streams.
 */
export async function purgeExpiredTrash(
  db: Database,
  now: Date,
): Promise<{ accountId: string; changes: Change[] }[]> {
  const owners = await db
    .selectDistinct({ ownerId: trashUnits.ownerId })
    .from(trashUnits)
    .where(lte(trashUnits.expiresAt, now));
  const purged: { accountId: string; changes: Change[] }[] = [];
  for (const { ownerId } of owners) {
    // oxlint-disable-next-line no-await-in-loop
    const changes = await db.transaction(async (tx) => {
      const seq = await lockAccount(tx, ownerId);
      const store = collectionStore(tx);
      const units = await tx
        .select(storedUnitColumns)
        .from(trashUnits)
        .where(and(eq(trashUnits.ownerId, ownerId), lte(trashUnits.expiresAt, now)))
        .orderBy(asc(trashUnits.expiresAt), asc(trashUnits.id));
      const inputs: ChangeInput[] = [];
      for (const unit of units) {
        // oxlint-disable-next-line no-await-in-loop
        inputs.push(...(await purgeUnit(store, unit)));
      }
      return inputs.length > 0 ? logChanges(tx, ownerId, seq, inputs, null) : [];
    });
    if (changes.length > 0) purged.push({ accountId: ownerId, changes });
  }
  return purged;
}
