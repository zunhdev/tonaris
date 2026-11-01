// A TanStack DB collection over the sync protocol's snapshot and stream (TS-24): the engine fills it from the
// bootstrap and applies each committed change to its entity's rows, so other sessions' changes appear live. Writes
// go through the handlers the caller gives, each persisting its transaction through the writer (writer.ts).

import {
  createCollection,
  type DeleteMutationFn,
  type InsertMutationFn,
  type UpdateMutationFn,
} from "@tanstack/db";

import type { Bootstrap, Change } from "@tonaris/domain";

import type { SyncEngine } from "./engine";

/** The entities the stream changes. */
type Entity = Change["entity"];

/** A row of the entity a change is to, as the snapshot and the change carry it. */
type RowOf<C extends Change> = NonNullable<C["data"]>;

/**
 * A collection of entity `entity`'s rows. `C`, its changes, follows from the entity: the rows are typed by them
 * (`Extract<Change, { entity: E }>["data"]`).
 */
export function snapshotCollection<
  E extends Entity,
  C extends Change = Extract<Change, { entity: E }>,
>({
  engine,
  id,
  entity,
  rows,
  getKey,
  keyOfChange = (change) => change.id,
  handlers = {},
}: {
  engine: SyncEngine;
  id: string;
  /** The entity whose changes the collection's rows follow. */
  entity: E;
  /** The collection's rows in a snapshot. */
  rows: (snapshot: Bootstrap) => RowOf<C>[];
  getKey: (row: RowOf<C>) => string;
  /** The key of the row a change is to: its `id`, unless the collection keys its rows otherwise. */
  keyOfChange?: (change: C) => string;
  handlers?: {
    onInsert?: InsertMutationFn<RowOf<C>, string>;
    onUpdate?: UpdateMutationFn<RowOf<C>, string>;
    onDelete?: DeleteMutationFn<RowOf<C>, string>;
  };
}) {
  /** Whether a change is to this collection's entity: the entity names its member of the union. */
  const isOurs = (change: Change): change is C => change.entity === entity;
  return createCollection<RowOf<C>, string>({
    id,
    ...handlers,
    getKey,
    // The engine feeds every store from one stream, so the collection subscribes as soon as it exists and stays.
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
            for (const row of rows(snapshot)) {
              write({ type: "insert", value: row });
              synced.add(getKey(row));
            }
            void commit();
            markReady();
          },
          apply(change) {
            if (!isOurs(change)) return;
            const key = keyOfChange(change);
            // The row after the change; null when it deleted the row.
            const row = change.data;
            begin();
            if (row === null || row === undefined) {
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
