// Folders, lists and list entries: TanStack DB collections filled from the bootstrap snapshot and the stream
// (TS-24), so another session's changes appear live. Writes are optimistic, as for albums (albums.ts): folders and
// lists are created, renamed and moved (TON-26) and described (TON-54), and albums added to and removed from lists
// (TON-27), each becoming one envelope whose `base` is the value before the edit (TS-21).

import {
  containerFieldsSchema,
  membershipKey,
  type Container,
  type Membership,
  type Mutation,
} from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";
import { envelope, pick } from "./writes";

/** What `container.create` takes: the container's own fields, without a description, which is set afterwards. */
const createFields = containerFieldsSchema.keyof().options;

/**
 * A rename for a new name, a move for a new parent, and a description for a new one, each with the value before it
 * (TS-21). A new folder or list with a description is created, then described.
 */
function containerUpdates(original: Container, changes: Partial<Container>): Mutation[] {
  const updates: Mutation[] = [];
  const { id } = original;
  if (changes.name !== undefined && changes.name !== original.name) {
    updates.push(envelope("container.rename", { id, name: changes.name }, { name: original.name }));
  }
  if (changes.parentId !== undefined && changes.parentId !== original.parentId) {
    updates.push(
      envelope(
        "container.move",
        { id, parentId: changes.parentId },
        { parentId: original.parentId },
      ),
    );
  }
  if (changes.description !== undefined && changes.description !== original.description) {
    updates.push(
      envelope(
        "container.describe",
        { id, description: changes.description },
        { description: original.description },
      ),
    );
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
  return snapshotCollection({
    engine,
    id: "containers",
    entity: "container",
    rows: (s) => s.containers,
    getKey: (c) => c.id,
    handlers: {
      onInsert: ({ transaction }) =>
        writer.persistEach(transaction, ({ modified }) => {
          const { id, description } = modified;
          return [
            envelope("container.create", pick(modified, createFields)),
            ...(description
              ? [envelope("container.describe", { id, description }, { description: null })]
              : []),
          ];
        }),
      onUpdate: ({ transaction }) =>
        writer.persistEach(transaction, ({ original, changes }) =>
          containerUpdates(original, changes),
        ),
    },
  });
}

/** The write that adds an album to a list, or removes it. */
const entryWrite = (
  name: "membership.add" | "membership.remove",
  { listId, albumId }: Membership,
) => [envelope(name, { listId, albumId })];

export function createMembershipCollection({
  engine,
  writer,
}: {
  engine: SyncEngine;
  writer: Writer;
}) {
  return snapshotCollection({
    engine,
    id: "memberships",
    entity: "membership",
    rows: (s) => s.memberships,
    getKey: (m) => membershipKey(m.listId, m.albumId),
    handlers: {
      onInsert: ({ transaction }) =>
        writer.persistEach(transaction, ({ modified }) => entryWrite("membership.add", modified)),
      onDelete: ({ transaction }) =>
        writer.persistEach(transaction, ({ original }) =>
          entryWrite("membership.remove", original),
        ),
    },
  });
}

export type ContainerCollection = ReturnType<typeof createContainerCollection>;
export type MembershipCollection = ReturnType<typeof createMembershipCollection>;
