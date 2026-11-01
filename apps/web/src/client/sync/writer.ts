// How an optimistic write settles (TS-22, TS-24, TS-27). A collection's handler persists its transaction's writes
// here, as one outbox entry, and resolves only once the stream has delivered the change, so the optimistic value
// gives way to the same saved value without a flicker. A rejection or a conflict throws, which rolls the optimistic
// value back (FR-09.3). Each write is tracked in the save states (save-states.ts), which keep what the person must
// deal with; a transaction of several writes is reported there as a batch (FR-13.4, DS-84). Writes adopted from a
// reloaded tab have no transaction: they show as unconfirmed until answered.

import type { Mutation, Outcome } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { Outbox } from "./outbox";
import type { OutboxEntry, OutboxItem } from "./persistence";
import type { SaveStates } from "./save-states";

// Where features/** still imports them from, until they import save-states.ts (TON-147).
export type { BatchReport, SaveState } from "./save-states";

/** Thrown from a collection handler when the server didn't apply a write; TanStack DB rolls back. */
export class MutationRejected extends Error {
  constructor(readonly outcome: Exclude<Outcome, { status: "confirmed" }>) {
    super(`The change was not saved: ${outcome.status}.`);
    this.name = "MutationRejected";
  }
}

/** What the writer needs of a TanStack DB transaction: whether it still waits, and how to roll it back. */
export type WriteTransaction = {
  state: string;
  rollback(): unknown;
  isPersisted: { promise: Promise<unknown> };
};

/**
 * Lets a write go without waiting on it where it was made: the save states report its outcome (DS-80), so a
 * rejection is expected there, not here.
 */
export function sent(transaction: Pick<WriteTransaction, "isPersisted">): void {
  transaction.isPersisted.promise.catch(() => {});
}

export type Writer = ReturnType<typeof createWriter>;

export function createWriter({
  outbox,
  engine,
  states,
  confirmWithinMs = 15_000,
}: {
  outbox: Outbox;
  engine: SyncEngine;
  states: SaveStates;
  /** How long a write may take to reach the stream before it shows as unconfirmed (TS-24). */
  confirmWithinMs?: number;
}) {
  /** The transactions waiting on their writes, by the keys they change. */
  const waiting = new Map<string, Set<WriteTransaction>>();

  /**
   * Settles each write from its outcome. A confirmed one settles once the stream has delivered it, so its value is
   * in the collection; answers the first write that wasn't applied, if any.
   */
  async function settle(
    items: readonly OutboxItem[],
    outcomes: readonly Outcome[],
  ): Promise<Exclude<Outcome, { status: "confirmed" }> | undefined> {
    let seq = 0;
    let rejected: Exclude<Outcome, { status: "confirmed" }> | undefined;
    for (const [index, { mutation }] of items.entries()) {
      const outcome = outcomes[index];
      if (!outcome) continue;
      if (outcome.status === "confirmed") seq = Math.max(seq, outcome.seq);
      else {
        states.settle(mutation.mutationId, outcome);
        rejected ??= outcome;
      }
    }
    if (seq > 0) await engine.awaitSeq(seq);
    for (const [index, { mutation }] of items.entries()) {
      const outcome = outcomes[index];
      if (outcome?.status === "confirmed") states.settle(mutation.mutationId, outcome);
    }
    return rejected;
  }

  /**
   * Rolls back the other transactions still waiting on the same records: their optimistic rows were built on the
   * rejected value. Their writes still go out, and their saved values come back through the stream.
   */
  function rollBackLater(transaction: WriteTransaction, keys: readonly string[]): void {
    for (const key of keys) {
      for (const other of waiting.get(key) ?? []) {
        if (other === transaction || other.state !== "persisting") continue;
        // Its caller may not wait on it; the rejection is expected.
        sent(other);
        other.rollback();
      }
    }
  }

  /** Persists one transaction's writes, as one outbox entry; rejects if any wasn't applied. */
  async function persist(
    transaction: WriteTransaction,
    items: readonly OutboxItem[],
  ): Promise<void> {
    const keys = [...new Set(items.map((item) => item.key))];
    const batch = states.batchFor(items.length);
    for (const { mutation, key } of items) states.track(mutation, key, "pending", batch);
    for (const key of keys) waiting.set(key, (waiting.get(key) ?? new Set()).add(transaction));
    const late = setTimeout(() => {
      for (const { mutation } of items) states.unconfirmed(mutation.mutationId);
    }, confirmWithinMs);
    try {
      const rejected = await settle(items, await outbox.enqueue(items));
      if (rejected) {
        rollBackLater(transaction, keys);
        throw new MutationRejected(rejected);
      }
    } finally {
      clearTimeout(late);
      for (const key of keys) {
        waiting.get(key)?.delete(transaction);
        if (waiting.get(key)?.size === 0) waiting.delete(key);
      }
    }
  }

  return {
    persist,

    /**
     * Persists a collection handler's transaction: the writes each of its rows makes, under the row's key, or under
     * `keyOf`'s for writes tracked apart from their row, such as a view's choices.
     */
    persistEach<Pending extends { key: string }>(
      transaction: WriteTransaction & { mutations: readonly Pending[] },
      writesOf: (pending: Pending) => readonly Mutation[],
      keyOf: (pending: Pending) => string = (pending) => pending.key,
    ): Promise<void> {
      return persist(
        transaction,
        transaction.mutations.flatMap((pending) =>
          writesOf(pending).map((mutation) => ({ key: keyOf(pending), mutation })),
        ),
      );
    },

    /**
     * Tracks an entry adopted from a reloaded tab: unconfirmed until its outcomes arrive. Several writes are reported
     * as a batch of their own.
     */
    restored(entry: OutboxEntry, outcomes: Promise<Outcome[]>): void {
      const batch = states.batchFor(entry.items.length);
      for (const { mutation, key } of entry.items)
        states.track(mutation, key, "unconfirmed", batch);
      void outcomes.then((answered) => settle(entry.items, answered));
    },
  };
}
