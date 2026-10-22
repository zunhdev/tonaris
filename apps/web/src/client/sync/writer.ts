// How an optimistic write settles (TS-22, TS-24, TS-27). A collection's handler persists its transaction's writes
// here, as one outbox entry, and resolves only once the stream has delivered the change, so the optimistic value
// gives way to the same saved value without a flicker. A rejection or a conflict throws, which rolls the optimistic
// value back (FR-09.3); a conflict's attempt stays in the review queue, kept in the browser, until the person deals
// with it (FR-09.4), and so does a failure, until it is retried or dismissed (FR-13.2). Every write's state is kept
// for the save markers and Activity (DS-80, DS-81): pending, unconfirmed after 15 s or a send without an answer,
// and the outcome once there is one. Success is never reported for an unconfirmed write (FR-13.3). Writes adopted
// from a reloaded tab have no transaction: they show as unconfirmed until answered.
// A transaction of several writes is a batch, reported together (FR-13.4, DS-84). Its report closes by itself once
// every write is confirmed; once one isn't, it is kept, in the browser too, until dismissed, and its failures and
// conflicts are kept in it rather than on their own.

import { uuidv7, type Mutation, type Outcome, type OutcomeStatus } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { Outbox, QueuedState } from "./outbox";
import type { OutboxEntry, OutboxItem, StoredBatch, SyncPersistence } from "./persistence";

export type SaveState = {
  mutation: Mutation;
  /** The record's key in its collection. */
  key: string;
  status: OutcomeStatus;
  outcome?: Outcome;
  /** When this page began tracking it, in ms since the epoch: a pending write is shown after 300 ms (DS-80). */
  since: number;
  /** The batch it was made in, if it was made with others in one action (DS-84). */
  batch?: string;
};

/** One action's writes, reported together (FR-13.4, DS-84). */
export type BatchReport = {
  id: string;
  /** When it was made, in ms since the epoch. */
  since: number;
  /** Its writes in the order they were made; a retry's writes come after the rest. */
  items: readonly SaveState[];
  /** Something in it didn't save, so it stays until dismissed. */
  kept: boolean;
};

/** Thrown from a collection handler when the server didn't apply a write; TanStack DB rolls back. */
export class MutationRejected extends Error {
  constructor(readonly outcome: Exclude<Outcome, { status: "confirmed" }>) {
    super(`The change was not saved: ${outcome.status}.`);
    this.name = "MutationRejected";
  }
}

const settled = new Set<OutcomeStatus>([
  "confirmed",
  "failed",
  "conflict",
  "skipped",
  "needs_input",
  "needs_approval",
]);

/** The states Activity lists: not saved yet, or waiting for the person (DS-81, DS-84). */
const listed = new Set<OutcomeStatus>([
  "pending",
  "unconfirmed",
  "failed",
  "conflict",
  "skipped",
  "needs_input",
  "needs_approval",
]);

/** What the person deals with: kept until retried, resolved or dismissed. Only a batch's writes are skipped. */
const kept = new Set<OutcomeStatus>([
  "failed",
  "conflict",
  "skipped",
  "needs_input",
  "needs_approval",
]);

type Batch = { id: string; since: number; members: string[]; kept: boolean };

export type SaveStates = ReturnType<typeof createSaveStates>;

/** The save states, with the conflicts, failures and kept batch reports in `persistence` across reloads. */
export function createSaveStates({
  persistence,
  logError = (error: unknown) =>
    console.error("The review queue couldn't use the browser's storage", error),
}: { persistence?: SyncPersistence; logError?: (error: unknown) => void } = {}) {
  const states = new Map<string, SaveState>();
  const batches = new Map<string, Batch>();
  const listeners = new Set<(state: SaveState) => void>();
  const changeListeners = new Set<() => void>();
  const reportListeners = new Set<(report: BatchReport, closed: boolean) => void>();
  /** `open()`'s and `reports()`' answers until the next change, so React reads the same array while nothing changed. */
  let opened: SaveState[] | undefined;
  let reported: BatchReport[] | undefined;
  /** The batch that writes tracked now join: a retry from its report. */
  let joining: string | undefined;
  /** Kept batches to write to the browser, once per microtask. */
  const unsaved = new Set<string>();

  const changed = () => {
    opened = undefined;
    reported = undefined;
    for (const listener of changeListeners) listener();
  };

  function reportOf({ id, since, members, kept: isKept }: Batch): BatchReport {
    const items = members.flatMap((member) => states.get(member) ?? []);
    return { id, since, items, kept: isKept };
  }

  function saveSoon(id: string): void {
    if (unsaved.size === 0) queueMicrotask(saveReports);
    unsaved.add(id);
  }

  /** Writes the kept batches that changed: their writes that have an outcome, which the outbox no longer holds. */
  function saveReports(): void {
    for (const id of unsaved) {
      const batch = batches.get(id);
      if (!batch?.kept) continue;
      const items = reportOf(batch).items.flatMap(({ mutation, key, outcome }) =>
        outcome ? [{ mutation, key, outcome }] : [],
      );
      const stored: StoredBatch = { id, createdAt: batch.since, items };
      // With every write retried and underway, the outbox holds them all.
      (items.length > 0 ? persistence?.putBatch(stored) : persistence?.deleteBatch(id))?.catch(
        logError,
      );
    }
    unsaved.clear();
  }

  /** Tells the report listeners about batch `id`; closes it once every write is confirmed and it isn't kept. */
  function reportChanged(id: string, { save = true } = {}): void {
    const batch = batches.get(id);
    if (!batch) return;
    const report = reportOf(batch);
    const closed = !batch.kept && report.items.every((item) => item.status === "confirmed");
    if (closed) batches.delete(id);
    else if (batch.kept && save) saveSoon(id);
    for (const listener of reportListeners) listener(report, closed);
  }

  const emit = (state: SaveState) => {
    for (const listener of listeners) listener(state);
    if (state.batch) reportChanged(state.batch);
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

  /** Keeps a write's failure or conflict in the browser until the person deals with it. */
  function keep({ mutation, key, outcome }: SaveState): void {
    if (outcome?.status === "conflict") {
      persistence?.putConflict({ mutation, key, outcome }).catch(logError);
    } else if (outcome?.status === "failed") {
      persistence?.putFailure({ mutation, key, outcome }).catch(logError);
    }
  }

  /** Takes a write out of its batch; a batch left empty is gone, from the browser too. */
  function leave(state: SaveState): void {
    const batch = state.batch === undefined ? undefined : batches.get(state.batch);
    if (!batch) return;
    batch.members = batch.members.filter((member) => member !== state.mutation.mutationId);
    if (batch.members.length > 0) {
      reportChanged(batch.id);
      return;
    }
    batches.delete(batch.id);
    persistence?.deleteBatch(batch.id).catch(logError);
    for (const listener of reportListeners) listener(reportOf(batch), true);
  }

  return {
    /** The batch a transaction of `writes` writes is reported in: the one a retry joins, or a new one for two or more. */
    batchFor(writes: number): string | undefined {
      return joining ?? (writes > 1 ? uuidv7() : undefined);
    },
    track(
      mutation: Mutation,
      key: string,
      status: QueuedState = "pending",
      batch: string | undefined = states.get(mutation.mutationId)?.batch,
    ): void {
      const state: SaveState = {
        mutation,
        key,
        status,
        since: Date.now(),
        ...(batch ? { batch } : {}),
      };
      if (batch) {
        const members = batches.get(batch)?.members;
        if (!members)
          batches.set(batch, {
            id: batch,
            since: state.since,
            members: [mutation.mutationId],
            kept: false,
          });
        else if (!members.includes(mutation.mutationId)) members.push(mutation.mutationId);
      }
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
      const before = states.get(mutationId);
      const batch = before?.batch === undefined ? undefined : batches.get(before.batch);
      if (batch && outcome.status !== "confirmed") batch.kept = true;
      update(mutationId, { status: outcome.status, outcome });
      const state = states.get(mutationId);
      if (state && !batch && kept.has(outcome.status)) keep(state);
    },
    /** Loads the conflicts, failures and batch reports kept from earlier pages. */
    async restore(): Promise<void> {
      try {
        const [conflicts, failures, reports] = await Promise.all([
          persistence?.conflicts() ?? [],
          persistence?.failures() ?? [],
          persistence?.batches() ?? [],
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
        for (const { id, createdAt, items } of reports) {
          const members = items.map((item) => item.mutation.mutationId);
          batches.set(id, { id, since: createdAt, members, kept: true });
          for (const { mutation, key, outcome } of items) {
            if (states.has(mutation.mutationId)) continue;
            const state = {
              mutation,
              key,
              status: outcome.status,
              outcome,
              since: createdAt,
              batch: id,
            };
            states.set(mutation.mutationId, state);
            for (const listener of listeners) listener(state);
          }
          reportChanged(id, { save: false });
        }
        changed();
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
     * Every write not saved yet or waiting for the person, in the order they were made, batches' writes included
     * (DS-81). The same array until something changes.
     */
    open(): readonly SaveState[] {
      // The map keeps the order writes were tracked in.
      opened ??= [...states.values()].filter((state) => listed.has(state.status));
      return opened;
    },
    /**
     * The open batch reports, oldest first: those still underway, and those kept until dismissed (DS-84). The same
     * array until something changes.
     */
    reports(): readonly BatchReport[] {
      reported ??= [...batches.values()].map(reportOf).toSorted((a, b) => a.since - b.since);
      return reported;
    },
    /**
     * Clears a write the person dealt with: they kept the saved value, retried, or made a new change. A write in a
     * batch leaves its report.
     */
    dismiss(mutationId: string): void {
      const state = states.get(mutationId);
      if (!state || !kept.has(state.status)) return;
      if (state.batch !== undefined) {
        states.delete(mutationId);
        leave(state);
      } else {
        if (state.status === "conflict") persistence?.deleteConflict(mutationId).catch(logError);
        else if (state.status === "failed") persistence?.deleteFailure(mutationId).catch(logError);
        states.delete(mutationId);
      }
      changed();
    },
    /**
     * Dismisses a batch report and the inputs it kept (DS-84). Its writes still underway, such as a retry in flight,
     * go on as writes of their own.
     */
    dismissReport(id: string): void {
      const batch = batches.get(id);
      if (!batch) return;
      batches.delete(id);
      persistence?.deleteBatch(id).catch(logError);
      const report = reportOf(batch);
      for (const state of report.items) {
        if (kept.has(state.status)) states.delete(state.mutation.mutationId);
        else {
          const { batch: _batch, ...loose } = state;
          states.set(state.mutation.mutationId, loose);
        }
      }
      for (const listener of reportListeners) listener(report, true);
      changed();
    },
    /** Runs `make` so that the writes it makes join batch `id`'s report: a retry from it (DS-84). */
    within<T>(id: string, make: () => T): T {
      const outer = joining;
      joining = id;
      try {
        return make();
      } finally {
        joining = outer;
      }
    },
    subscribe(listener: (state: SaveState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Calls `listener` after each change to a batch report, with whether it closed or was dismissed. */
    onReport(listener: (report: BatchReport, closed: boolean) => void): () => void {
      reportListeners.add(listener);
      return () => reportListeners.delete(listener);
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
