// Every write's save state (DS-80, DS-81, TS-24), for the save markers, Activity and the batch reports: pending,
// unconfirmed after 15 s or a send without an answer, and the outcome once there is one. Success is never reported for
// an unconfirmed write (FR-13.3). A conflict's attempt stays in the review queue, kept in the browser, until the person
// deals with it (FR-09.4), and so does a failure, until it is retried or dismissed (FR-13.2).
// A transaction of several writes is a batch, reported together (FR-13.4, DS-84). Its report closes by itself once
// every write is confirmed; once one isn't, it is kept, in the browser too, until dismissed, and its failures and
// conflicts are kept in it rather than on their own. The writer (writer.ts) tracks and settles the writes.

import { uuidv7, type Mutation, type Outcome, type OutcomeStatus } from "@tonaris/domain";

import { queuedStates, type QueuedState } from "./outbox";
import type { StoredBatch, StoredConflict, StoredFailure, SyncPersistence } from "./persistence";

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

/** Whether a write is still on its way: queued or in flight, or sent without an answer (TS-22). */
export function isUnderway(status: OutcomeStatus): status is QueuedState {
  return (queuedStates as readonly OutcomeStatus[]).includes(status);
}

/**
 * Whether a write settled without being saved: it failed, met a newer value, was skipped, or waits for the person's
 * choice or approval. The person deals with it, so it is kept until retried, resolved or dismissed. Only a batch's
 * writes are skipped. Activity lists these and the writes still underway (DS-81).
 */
export function needsPerson(status: OutcomeStatus): boolean {
  return status !== "confirmed" && !isUnderway(status);
}

/**
 * The states a record's marker shows, most pressing first (DS-80): a conflict or a choice to make, a failure or a
 * skip, then unconfirmed and pending writes.
 */
export const markerStatuses: readonly OutcomeStatus[] = [
  "conflict",
  "needs_input",
  "needs_approval",
  "failed",
  "skipped",
  "unconfirmed",
  "pending",
];

/**
 * The browser store a write kept on its own waits in, by its status: conflicts for review, and failures, with the
 * captures waiting for the person's choice or details, which keep their links that way (TON-45). Undefined for the
 * rest, kept only in a batch's report.
 */
export function storeOf(status: OutcomeStatus): "conflicts" | "failures" | undefined {
  if (status === "conflict") return "conflicts";
  if (status === "failed" || status === "needs_input") return "failures";
  return undefined;
}

/** The outcomes each store keeps. */
type Kept = { conflicts: StoredConflict["outcome"]; failures: StoredFailure["outcome"] };

/** Whether `store` keeps `outcome`, by `storeOf`. */
const keptIn = <Store extends keyof Kept>(store: Store, outcome: Outcome): outcome is Kept[Store] =>
  storeOf(outcome.status) === store;

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
    if (!isUnderway(state.status) && !patch.outcome) return;
    const next = { ...state, ...patch };
    states.set(mutationId, next);
    emit(next);
  };

  /**
   * Keeps a write's failure or conflict in the browser until the person deals with it, and a capture waiting for
   * their choice or details with it (TON-45).
   */
  function keep({ mutation, key, outcome }: SaveState): void {
    if (!outcome) return;
    if (keptIn("conflicts", outcome)) {
      persistence?.putConflict({ mutation, key, outcome }).catch(logError);
    } else if (keptIn("failures", outcome)) {
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
      if (state && !batch && needsPerson(outcome.status)) keep(state);
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
      return [...states.values()].filter((state) => state.key === key && isUnderway(state.status));
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
      opened ??= [...states.values()].filter((state) => state.status !== "confirmed");
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
      if (!state || !needsPerson(state.status)) return;
      if (state.batch !== undefined) {
        states.delete(mutationId);
        leave(state);
      } else {
        const store = storeOf(state.status);
        if (store === "conflicts") persistence?.deleteConflict(mutationId).catch(logError);
        else if (store === "failures") persistence?.deleteFailure(mutationId).catch(logError);
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
        if (needsPerson(state.status)) states.delete(state.mutation.mutationId);
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
