// Folders, lists and list entries: read-only TanStack DB collections, filled from the bootstrap snapshot (TS-24).
// Their commands and stream changes arrive with M2; until then a `reset` is their only update.

import { createCollection } from "@tanstack/db";

import type { Bootstrap, Container, Membership } from "@tonaris/domain";

import type { SyncEngine } from "./engine";

function snapshotCollection<Row extends object>(
  engine: SyncEngine,
  id: string,
  rowsOf: (snapshot: Bootstrap) => Row[],
  getKey: (row: Row) => string,
) {
  return createCollection<Row, string>({
    id,
    getKey,
    startSync: true,
    gcTime: 0,
    sync: {
      rowUpdateMode: "full",
      sync: ({ begin, write, commit, markReady, truncate }) => {
        const unregister = engine.register({
          reset(snapshot) {
            begin();
            truncate();
            for (const row of rowsOf(snapshot)) write({ type: "insert", value: row });
            void commit();
            markReady();
          },
          apply: () => {},
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
  );
}

export function createMembershipCollection(engine: SyncEngine) {
  return snapshotCollection<Membership>(
    engine,
    "memberships",
    (s) => s.memberships,
    (m) => `${m.listId}:${m.albumId}`,
  );
}
