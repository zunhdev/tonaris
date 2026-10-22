// Folders, lists and list entries: read-only TanStack DB collections, filled from the bootstrap snapshot (TS-24).
// They follow the stream, so another session's new, renamed and moved folders and lists (TON-26) and the albums
// it adds to and removes from lists (TON-27) appear live. Writing them from this client arrives with TON-30,
// TON-33 and TON-38.

import { createCollection } from "@tanstack/db";

import {
  membershipKey,
  type Bootstrap,
  type Change,
  type Container,
  type Membership,
} from "@tonaris/domain";

import type { SyncEngine } from "./engine";

/** A stream change to one row: its key, and the row after it, or null when deleted. */
type RowChange<Row> = { key: string; row: Row | null };

function snapshotCollection<Row extends object>(
  engine: SyncEngine,
  id: string,
  rowsOf: (snapshot: Bootstrap) => Row[],
  getKey: (row: Row) => string,
  /** The change to this collection's rows that a stream change makes, if it makes one. */
  rowChangeOf: (change: Change) => RowChange<Row> | undefined = () => undefined,
) {
  return createCollection<Row, string>({
    id,
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

export function createContainerCollection(engine: SyncEngine) {
  return snapshotCollection<Container>(
    engine,
    "containers",
    (s) => s.containers,
    (c) => c.id,
    (change) => (change.entity === "container" ? { key: change.id, row: change.data } : undefined),
  );
}

export function createMembershipCollection(engine: SyncEngine) {
  return snapshotCollection<Membership>(
    engine,
    "memberships",
    (s) => s.memberships,
    (m) => membershipKey(m.listId, m.albumId),
    (change) => (change.entity === "membership" ? { key: change.id, row: change.data } : undefined),
  );
}
