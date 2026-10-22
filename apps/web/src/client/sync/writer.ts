// How an optimistic write settles (TS-22, TS-24, TS-27). A collection's handler persists its transaction's writes
// here, as one outbox entry, and resolves only once the stream has delivered the change, so the optimistic value
// gives way to the same saved value without a flicker. A rejection or a conflict throws, which rolls the optimistic
// value back (FR-09.3); a conflict's attempt stays in the review queue, kept in the browser, until the person deals
// with it (FR-09.4), and so does a failure, until it is retried or dismissed (FR-13.2). Every write's state is kept
// for the save markers and Activity (DS-80, DS-81): pending, unconfirmed after 15 s or a send without an answer,
// and the outcome once there is one. Success is never reported for an unconfirmed write (FR-13.3). Writes adopted
// from a reloaded tab have no transaction: they show as unconfirmed until answered.

import type { Mutation, Outcome, OutcomeStatus } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { Outbox, QueuedState } from "./outbox";
import type { OutboxEntry, OutboxItem, SyncPersistence } from "./persistence";

export type SaveState = {
  mutation: Mutation;
  /** The record's key in its collection. */
  key: string;
  status: OutcomeStatus;
  outcome?: Outcome;
  /** When this page began tracking it, in ms since the epoch: a pending write is shown after 300 ms (DS-80). */
  since: number;
};

/** Thrown from a collection handler when the server didn't apply a write; TanStack DB rolls back. */
export class MutationRejected extends Error {
  constructor(readonly outcome: Exclude<Outcome, { status: "confirmed" }>) {
    super(`The change was not saved: ${outcome.status}.`);
    this.name = "MutationRejected";
  }
}

const settled = new Set<OutcomeStatus>(["confirmed", "failed", "conflict", "skipped"]);

/** The states Activity lists: not saved yet, or waiting for the person (DS-81). */
const listed = new Set<OutcomeStatus>(["pending", "unconfirmed", "failed", "conflict"]);

/** What the person deals with: kept in the browser until retried, resolved or dismissed. */
const kept = new Set<OutcomeStatus>(["failed", "conflict"]);

export type SaveStates = ReturnType<typeof createSaveStates>;

/** The save states, with the conflicts and failures kept in `persistence` across reloads. */
export function createSaveStates({
  persistence,
  logError = (error: unknown) =>
    console.error("The review queue couldn't use the browser's storage", error),
}: { persistence?: SyncPersistence; logError?: (error: unknown) => void } = {}) {
  const states = new Map<string, SaveState>();
  const listeners = new Set<(state: SaveState) => void>();
  const changeListeners = new Set<() => void>();
  /** `open()`'s answer until the next change, so React reads the same array while nothing changed. */
  let opened: SaveState[] | undefined;

  const changed = () => {
    opened = undefined;
    for (const listener of changeListeners) listener();
  };
  const emit = (state: SaveState) => {
    for (const listener of listeners) listener(state);
    changed();
  };

  const update = (mutationId: string, patch: Partial<SaveState>) => {
    const state = states.get(mutationId);
    if (!state) return;
    // A late timer or retry never takes a settled mutation back to pending or unconfirmed.
    if (settled.has(state.status) && !patch.outcome) return;
    const next = { ...state, ...patch };
    states.set(mutationId, next);
    emit(next);
  };

  /** Keeps a failure or a conflict in the browser until the person deals with it. */
  function keep({ mutation, key, outcome }: SaveState): void {
    if (outcome?.status === "conflict") {
      persistence?.putConflict({ mutation, key, outcome }).catch(logError);
    } else if (outcome?.status === "failed") {
      persistence?.putFailure({ mutation, key, outcome }).catch(logError);
    }
  }

  return {
    track(mutation: Mutation, key: string, status: QueuedState = "pending"): void {
      const state = { mutation, key, status, since: Date.now() };
      states.set(mutation.mutationId, state);
      emit(state);
    },
    /** For the outbox: queued, or sent without an answer. */
    queued(mutation: Mutation, state: QueuedState): void {
      update(mutation.mutationId, { status: state });
    },
    unconfirmed(mutationId: string): void {
      update(mutationId, { status: "unconfirmed" });
    },
    settle(mutationId: string, outcome: Outcome): void {
      update(mutationId, { status: outcome.status, outcome });
      const state = states.get(mutationId);
      if (state && kept.has(outcome.status)) keep(state);
    },
    /** Loads the conflicts and failures kept from earlier pages. */
    async restore(): Promise<void> {
      try {
        const [conflicts, failures] = await Promise.all([
          persistence?.conflicts() ?? [],
          persistence?.failures() ?? [],
        ]);
        const restored = [...conflicts, ...failures].toSorted((a, b) =>
          a.mutation.mutationId < b.mutation.mutationId ? -1 : 1,
        );
        for (const { mutation, key, outcome } of restored) {
          const state: SaveState = {
            mutation,
            key,
            status: outcome.status,
            outcome,
            since: Date.now(),
          };
          states.set(mutation.mutationId, state);
          emit(state);
        }
      } catch (error) {
        logError(error);
      }
    },
    get(mutationId: string): SaveState | undefined {
      return states.get(mutationId);
    },
    /** The record's writes not yet settled: what its save marker shows (DS-80). */
    unsettled(key: string): SaveState[] {
      return [...states.values()].filter(
        (state) => state.key === key && !settled.has(state.status),
      );
    },
    /** Attempts that met a newer saved value, kept for review (FR-09.4). */
    conflicts(): SaveState[] {
      return [...states.values()].filter((state) => state.status === "conflict");
    },
    /**
     * What Activity lists (DS-81): writes pending, unconfirmed, failed or in conflict, in the order they were made.
     * The same array until something changes.
     */
    open(): readonly SaveState[] {
      // The map keeps the order writes were tracked in.
      opened ??= [...states.values()].filter((state) => listed.has(state.status));
      return opened;
    },
    /**
     * Clears a failure or a conflict the person dealt with: they kept the saved value, retried, or made a new
     * change.
     */
    dismiss(mutationId: string): void {
      const status = states.get(mutationId)?.status;
      if (status === "conflict") persistence?.deleteConflict(mutationId).catch(logError);
      else if (status === "failed") persistence?.deleteFailure(mutationId).catch(logError);
      else return;
      states.delete(mutationId);
      changed();
    },
    subscribe(listener: (state: SaveState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Calls `listener` after any change, dismissals included, as React's external stores expect. */
    onChange(listener: () => void): () => void {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };
}

/** What the writer needs of a TanStack DB transaction: whether it still waits, and how to roll it back. */
export type WriteTransaction = {
  state: string;
  rollback(): unknown;
  isPersisted: { promise: Promise<unknown> };
};

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
        other.isPersisted.promise.catch(() => {});
        other.rollback();
      }
    }
  }

  return {
    /** Persists one transaction's writes, as one outbox entry; rejects if any wasn't applied. */
    async persist(transaction: WriteTransaction, items: readonly OutboxItem[]): Promise<void> {
      const keys = [...new Set(items.map((item) => item.key))];
      for (const { mutation, key } of items) states.track(mutation, key);
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
    },

    /** Tracks an entry adopted from a reloaded tab: unconfirmed until its outcomes arrive. */
    restored(entry: OutboxEntry, outcomes: Promise<Outcome[]>): void {
      for (const { mutation, key } of entry.items) states.track(mutation, key, "unconfirmed");
      void outcomes.then((answered) => settle(entry.items, answered));
    },
  };
}
