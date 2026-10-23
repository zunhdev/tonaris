// A TanStack DB collection over the sync protocol's snapshot and stream (TS-24): the engine fills it from the
// bootstrap and applies each committed change to its rows, so other sessions' changes appear live. Writes go
// through the handlers the caller gives, each persisting its transaction through the writer (writer.ts).

import {
  createCollection,
  type DeleteMutationFn,
  type InsertMutationFn,
  type UpdateMutationFn,
} from "@tanstack/db";

import type { Bootstrap, Change } from "@tonaris/domain";

import type { SyncEngine } from "./engine";

/** A stream change to one row: its key, and the row after it, or null when deleted. */
type RowChange<Row> = { key: string; row: Row | null };

export function snapshotCollection<Row extends object>(
  engine: SyncEngine,
  id: string,
  rowsOf: (snapshot: Bootstrap) => Row[],
  getKey: (row: Row) => string,
  /** The change to this collection's rows that a stream change makes, if it makes one. */
  rowChangeOf: (change: Change) => RowChange<Row> | undefined,
  handlers: {
    onInsert?: InsertMutationFn<Row, string>;
    onUpdate?: UpdateMutationFn<Row, string>;
    onDelete?: DeleteMutationFn<Row, string>;
  },
) {
  return createCollection<Row, string>({
    id,
    ...handlers,
    getKey,
    startSync: true,
    gcTime: 0,
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady, truncate }) => {
        // Keys in the synced state, so a change is written as an insert or an update as TanStack DB expects.
        const synced = new Set<string>();
        const unregister = engine.register({
          reset(snapshot) {
            begin();
            truncate();
            synced.clear();
            for (const row of rowsOf(snapshot)) {
              write({ type: "insert", value: row });
              synced.add(getKey(row));
            }
            void commit();
            markReady();
          },
          apply(change) {
            const rowChange = rowChangeOf(change);
            if (!rowChange) return;
            const { key, row } = rowChange;
            begin();
            if (row === null) {
              if (synced.delete(key)) write({ type: "delete", key });
            } else {
              write({ type: synced.has(key) ? "update" : "insert", value: row });
              synced.add(key);
            }
            void commit();
          },
        });
        return () => {
          unregister();
        };
      },
    },
  });
}
