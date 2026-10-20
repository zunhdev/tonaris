// How an optimistic write settles (TS-22, TS-24, TS-27). The collection's handler persists its mutations here and
// resolves only once the stream has delivered the change, so the optimistic value gives way to the same saved
// value without a flicker. A rejection or a conflict throws, which rolls the optimistic value back (FR-09.3);
// a conflict's attempt stays in the review queue until the person deals with it (FR-09.4). Every mutation's
// state is kept for the save markers: pending, unconfirmed after 15 s or a send without an answer, and the
// outcome once there is one. Success is never reported for an unconfirmed write (FR-13.3).

import type { Mutation, Outcome, OutcomeStatus } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { Outbox, QueuedState } from "./outbox";

export type SaveState = {
  mutation: Mutation;
  /** The record's key in its collection. */
  key: string;
  status: OutcomeStatus;
  outcome?: Outcome;
};

/** Thrown from a collection handler when the server didn't apply the mutation; TanStack DB rolls back. */
export class MutationRejected extends Error {
  constructor(readonly outcome: Exclude<Outcome, { status: "confirmed" }>) {
    super(`The change was not saved: ${outcome.status}.`);
    this.name = "MutationRejected";
  }
}

const settled = new Set<OutcomeStatus>(["confirmed", "failed", "conflict", "skipped"]);

export type SaveStates = ReturnType<typeof createSaveStates>;

export function createSaveStates() {
  const states = new Map<string, SaveState>();
  const listeners = new Set<(state: SaveState) => void>();

  const update = (mutationId: string, patch: Partial<SaveState>) => {
    const state = states.get(mutationId);
    if (!state) return;
    // A late timer or retry never takes a settled mutation back to pending or unconfirmed.
    if (settled.has(state.status) && !patch.outcome) return;
    const next = { ...state, ...patch };
    states.set(mutationId, next);
    for (const listener of listeners) listener(next);
  };

  return {
    track(mutation: Mutation, key: string): void {
      states.set(mutation.mutationId, { mutation, key, status: "pending" });
      for (const listener of listeners) listener({ mutation, key, status: "pending" });
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
    /** Clears a reviewed conflict: the person kept the saved value or made a new change. */
    dismiss(mutationId: string): void {
      if (states.get(mutationId)?.status === "conflict") states.delete(mutationId);
    },
    subscribe(listener: (state: SaveState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
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
  async function persistOne({ mutation, key }: { mutation: Mutation; key: string }): Promise<void> {
    states.track(mutation, key);
    const late = setTimeout(() => states.unconfirmed(mutation.mutationId), confirmWithinMs);
    try {
      const outcome = await outbox.enqueue(mutation);
      if (outcome.status !== "confirmed") {
        states.settle(mutation.mutationId, outcome);
        throw new MutationRejected(outcome);
      }
      await engine.awaitSeq(outcome.seq);
      states.settle(mutation.mutationId, outcome);
    } finally {
      clearTimeout(late);
    }
  }

  return {
    /** Persists one transaction's mutations; rejects if any was not applied. */
    async persist(items: { mutation: Mutation; key: string }[]): Promise<void> {
      await Promise.all(items.map(persistOne));
    },
  };
}
