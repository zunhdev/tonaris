// Folders, lists and list entries: TanStack DB collections filled from the bootstrap snapshot and the stream
// (TS-24), so another session's changes appear live. Writes are optimistic, as for albums (albums.ts): folders and
// lists are created, renamed and moved (TON-26), and albums added to and removed from lists (TON-27), each
// becoming one envelope whose `base` is the value before the edit (TS-21).

import {
  membershipKey,
  uuidv7,
  type Container,
  type Membership,
  type Mutation,
} from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

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
