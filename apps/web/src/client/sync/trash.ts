// Trash on the client (FR-01.11 to FR-01.13, TS-13, TON-55): the owner's Trash units, a collection over the snapshot
// and the stream, and the two writes that move content in and out of it. Clients hold active content only, so
// deleting a folder or list takes it, its descendants and its lists' entries out of their collections at once, in
// one transaction, persisted as one `container.delete` per root with a unit ID chosen here (TS-10). Recovering puts
// them back the same way, as `trash.recover`. Neither uses the collections' own handlers, as in `positions.ts`.

import { createTransaction } from "@tanstack/db";

import {
  membershipKey,
  uuidv7,
  type Container,
  type Membership,
  type Mutation,
  type TrashUnit,
} from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import type { ContainerCollection, MembershipCollection } from "./lists";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

export function createTrashUnitCollection({ engine }: { engine: SyncEngine }) {
  return snapshotCollection<TrashUnit>(
    engine,
    "trashUnits",
    (snapshot) => snapshot.trashUnits,
    (unit) => unit.id,
    (change) => (change.entity === "trashUnit" ? { key: change.id, row: change.data } : undefined),
    {},
  );
}

export type TrashUnitCollection = ReturnType<typeof createTrashUnitCollection>;

/** What a deletion took out of the collections, to put back if it is undone. */
export type Deleted = {
  /** Each unit made: its ID and its root. */
  units: { unitId: string; rootId: string }[];
  containers: Container[];
  entries: Membership[];
};

export function createTrash({
  containers,
  memberships,
  trashUnits,
  writer,
}: {
  containers: ContainerCollection;
  memberships: MembershipCollection;
  trashUnits: TrashUnitCollection;
  writer: Writer;
}) {
  /** One transaction recovering `units`, with what `mutate` puts back meanwhile. */
  function recovery(units: readonly { unitId: string; rootId: string }[], mutate: () => void) {
    const transaction = createTransaction({
      mutationFn: async ({ transaction: written }) => {
        await writer.persist(
          written,
          units.map(({ unitId, rootId }) => {
            const mutation: Mutation = {
              mutationId: uuidv7(),
              name: "trash.recover",
              args: { unitId },
            };
            return { key: rootId, mutation };
          }),
        );
      },
    });
    transaction.mutate(() => {
      const gone = units.map((unit) => unit.unitId).filter((id) => trashUnits.has(id));
      if (gone.length > 0) trashUnits.delete(gone);
      mutate();
    });
    return transaction;
  }

  /** The folder or list and its descendants this client holds, itself first. */
  function subtree(rootId: string): Container[] {
    const root = containers.get(rootId);
    if (!root) return [];
    const found = [root];
    for (let index = 0; index < found.length; index += 1) {
      const parent = found[index]?.id;
      for (const row of containers.values()) if (row.parentId === parent) found.push(row);
    }
    return found;
  }

  return {
    /**
     * Moves each folder or list in `ids`, with what is inside it, to Trash: each one its own unit (FR-01.13). A
     * descendant of another one in `ids` goes with it. Answers what it took out, for an undo.
     */
    deleteContainers(ids: readonly string[]) {
      const roots = ids.filter((id) => {
        // Inside another root being deleted, it goes with that one.
        let parent = containers.get(id)?.parentId ?? null;
        while (parent !== null) {
          if (ids.includes(parent)) return false;
          parent = containers.get(parent)?.parentId ?? null;
        }
        return containers.has(id);
      });
      const units = roots.map((rootId) => ({ unitId: uuidv7(), rootId }));
      const removed = roots.flatMap(subtree);
      const lists = new Set(removed.filter((row) => row.kind === "list").map((row) => row.id));
      const entries = [...memberships.values()].filter((entry) => lists.has(entry.listId));
      const deleted: Deleted = { units, containers: removed, entries };

      const transaction = createTransaction({
        mutationFn: async ({ transaction: written }) => {
          await writer.persist(
            written,
            units.map(({ unitId, rootId }) => {
              const mutation: Mutation = {
                mutationId: uuidv7(),
                name: "container.delete",
                args: { id: rootId, unitId },
              };
              return { key: rootId, mutation };
            }),
          );
        },
      });
      transaction.mutate(() => {
        if (entries.length > 0) {
          memberships.delete(entries.map((entry) => membershipKey(entry.listId, entry.albumId)));
        }
        if (removed.length > 0) containers.delete(removed.map((row) => row.id));
      });
      return { transaction, deleted };
    },

    /** Recovers the units a deletion made, putting back what it took out (FR-01.14). */
    recover(deleted: Deleted) {
      return recovery(deleted.units, () => {
        const back = deleted.containers.filter((row) => !containers.has(row.id));
        if (back.length > 0) containers.insert(back);
        const entries = deleted.entries.filter(
          (entry) => !memberships.has(membershipKey(entry.listId, entry.albumId)),
        );
        if (entries.length > 0) memberships.insert(entries);
      });
    },

    /** Recovers units from Trash by ID; what they hold arrives from the server (FR-01.14). */
    recoverUnits(unitIds: readonly string[]) {
      return recovery(
        unitIds.map((unitId) => ({ unitId, rootId: trashUnits.get(unitId)?.rootId ?? unitId })),
        () => {},
      );
    },
  };
}

export type Trash = ReturnType<typeof createTrash>;
