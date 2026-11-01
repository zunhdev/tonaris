// Changes saved elsewhere (FR-09.1, DS-82): by another session or tab, or by an agent. Each change on the stream
// names the mutation that made it; one this tab didn't write is from elsewhere, and the views highlight its record
// for a moment. Listeners subscribe per record, so thousands of rows don't each hear every change. A bootstrap or
// a reset replaces the data rather than changing it, so it highlights nothing.

import type { SyncEngine } from "./engine";
import type { SaveStates } from "./save-states";

export type ChangesElsewhere = ReturnType<typeof createChangesElsewhere>;

export function createChangesElsewhere({
  engine,
  states,
}: {
  engine: SyncEngine;
  /** This tab's writes, confirmed ones included. */
  states: Pick<SaveStates, "get">;
}) {
  const listeners = new Map<string, Set<() => void>>();
  const unregister = engine.register({
    reset() {},
    apply(change) {
      if (change.mutationId !== null && states.get(change.mutationId)) return;
      // A change's ID is its record's key in the collection: an album's or a container's ID, or an entry's
      // `listId:albumId`.
      for (const listener of listeners.get(change.id) ?? []) listener();
    },
  });

  return {
    /** Calls `listener` whenever the record with `key` is changed elsewhere; returns the unsubscribe function. */
    subscribe(key: string, listener: () => void): () => void {
      const forKey = listeners.get(key) ?? new Set();
      listeners.set(key, forKey.add(listener));
      return () => {
        forKey.delete(listener);
        if (forKey.size === 0) listeners.delete(key);
      };
    },
    /** Highlights the record with `key` as a change from elsewhere would, as capture does for "Already in this list". */
    highlight(key: string): void {
      for (const listener of listeners.get(key) ?? []) listener();
    },
    stop: unregister,
  };
}
