// Folders, lists and list entries: TanStack DB collections filled from the bootstrap snapshot and the stream
// (TS-24), so another session's changes appear live. Writes are optimistic, as for albums (albums.ts): folders and
// lists are created, renamed and moved (TON-26), and albums added to and removed from lists (TON-27), each
// becoming one envelope whose `base` is the value before the edit (TS-21).

import {
  createCollection,
  type DeleteMutationFn,
  type InsertMutationFn,
  type UpdateMutationFn,
} from "@tanstack/db";

import {
  membershipKey,
  uuidv7,
  type Bootstrap,
  type Change,
  type Container,
  type Membership,
  type Mutation,
} from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { Writer } from "./writer";

/** A stream change to one row: its key, and the row after it, or null when deleted. */
type RowChange<Row> = { key: string; row: Row | null };

function snapshotCollection<Row extends object>(
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

/** The container's own fields only, whatever else the draft carried. */
function containerOf({ id, kind, parentId, name }: Container): Container {
  return { id, kind, parentId, name };
}

/** A rename for a new name and a move for a new parent, each with the value before it (TS-21). */
function containerUpdates(original: Container, changes: Partial<Container>): Mutation[] {
  const updates: Mutation[] = [];
  const { id } = original;
  if (changes.name !== undefined && changes.name !== original.name) {
    updates.push({
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id, name: changes.name },
      base: { name: original.name },
    });
  }
  if (changes.parentId !== undefined && changes.parentId !== original.parentId) {
    updates.push({
      mutationId: uuidv7(),
      name: "container.move",
      args: { id, parentId: changes.parentId },
      base: { parentId: original.parentId },
    });
  }
  return updates;
}

export function createContainerCollection({
  engine,
  writer,
}: {
  engine: SyncEngine;
  writer: Writer;
}) {
  return snapshotCollection<Container>(
    engine,
    "containers",
    (s) => s.containers,
    (c) => c.id,
    (change) => (change.entity === "container" ? { key: change.id, row: change.data } : undefined),
    {
      onInsert: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => ({
            key: pending.key,
            mutation: {
              mutationId: uuidv7(),
              name: "container.create",
              args: containerOf(pending.modified),
            },
          })),
        ),
      onUpdate: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.flatMap((pending) =>
            containerUpdates(pending.original, pending.changes).map((mutation) => ({
              key: pending.key,
              mutation,
            })),
          ),
        ),
    },
  );
}

/** The write that adds an album to a list, or removes it. */
function entryWrite(name: "membership.add" | "membership.remove", { listId, albumId }: Membership) {
  const mutation: Mutation = { mutationId: uuidv7(), name, args: { listId, albumId } };
  return { key: membershipKey(listId, albumId), mutation };
}

export function createMembershipCollection({
  engine,
  writer,
}: {
  engine: SyncEngine;
  writer: Writer;
}) {
  return snapshotCollection<Membership>(
    engine,
    "memberships",
    (s) => s.memberships,
    (m) => membershipKey(m.listId, m.albumId),
    (change) => (change.entity === "membership" ? { key: change.id, row: change.data } : undefined),
    {
      onInsert: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => entryWrite("membership.add", pending.modified)),
        ),
      onDelete: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => entryWrite("membership.remove", pending.original)),
        ),
    },
  );
}
