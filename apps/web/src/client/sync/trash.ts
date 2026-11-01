// Trash on the client (FR-01.11 to FR-01.13, TS-13, TON-55): the owner's Trash units, a collection over the snapshot
// and the stream, and the two writes that move content in and out of it. Clients hold active content only, so
// deleting a folder or list takes it, its descendants and its lists' entries out of their collections at once, in
// one transaction, persisted as one `container.delete` per root with a unit ID chosen here (TS-10). Recovering puts
// them back the same way, as `trash.recover`. Neither uses the collections' own handlers, as in `positions.ts`.

import { createTransaction } from "@tanstack/db";

import { membershipKey, uuidv7, type Container, type Membership } from "@tonaris/domain";

import type { AlbumCollection } from "./albums";
import type { SyncEngine } from "./engine";
import type { ContainerCollection, MembershipCollection } from "./lists";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";
import { envelope } from "./writes";

export function createTrashUnitCollection({ engine }: { engine: SyncEngine }) {
  return snapshotCollection({
    engine,
    id: "trashUnits",
    entity: "trashUnit",
    rows: (snapshot) => snapshot.trashUnits,
    getKey: (unit) => unit.id,
  });
}

export type TrashUnitCollection = ReturnType<typeof createTrashUnitCollection>;

/** Where to recover a unit's root, and as what, when not where and as it was (FR-01.15, FR-01.16). */
export type RecoveryChoice = { parentId?: string | null; name?: string };

/** What a deletion took out of the collections, to put back if it is undone. */
export type Deleted = {
  /** Each unit made: its ID and its root. */
  units: { unitId: string; rootId: string }[];
  containers: Container[];
  entries: Membership[];
};

export function createTrash({
  albums,
  containers,
  memberships,
  trashUnits,
  writer,
}: {
  albums: AlbumCollection;
  containers: ContainerCollection;
  memberships: MembershipCollection;
  trashUnits: TrashUnitCollection;
  writer: Writer;
}) {
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
            units.map(({ unitId, rootId }) => ({
              key: rootId,
              mutation: envelope("container.delete", { id: rootId, unitId }),
            })),
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

    /**
     * Moves an album to Trash as its own unit (FR-14.1): out of the albums and its entries at once, persisted as
     * `album.delete`. Answers the transaction and the unit's ID.
     */
    deleteAlbum(albumId: string) {
      const unitId = uuidv7();
      const entries = [...memberships.values()].filter((entry) => entry.albumId === albumId);
      const transaction = createTransaction({
        mutationFn: async ({ transaction: written }) => {
          const mutation = envelope("album.delete", { id: albumId, unitId });
          await writer.persist(written, [{ key: albumId, mutation }]);
        },
      });
      transaction.mutate(() => {
        if (entries.length > 0) {
          memberships.delete(entries.map((entry) => membershipKey(entry.listId, entry.albumId)));
        }
        if (albums.has(albumId)) albums.delete(albumId);
      });
      return { transaction, unitId };
    },

    /**
     * Removes units from Trash for good (FR-01.18), as the owner confirmed: they leave the Trash at once, and
     * `trash.purge` reports any already gone. Answers the transaction and its write's ID.
     */
    purge(unitIds: readonly string[]) {
      const mutation = envelope("trash.purge", { unitIds: [...unitIds] });
      const transaction = createTransaction({
        mutationFn: async ({ transaction: written }) => {
          await writer.persist(written, [{ key: `purge:${mutation.mutationId}`, mutation }]);
        },
      });
      transaction.mutate(() => {
        const held = unitIds.filter((unitId) => trashUnits.has(unitId));
        if (held.length > 0) trashUnits.delete(held);
      });
      return { transaction, mutationId: mutation.mutationId };
    },

    /**
     * Recovers a unit (FR-01.14 to FR-01.16): to `choice.parentId` and as `choice.name` when given, otherwise where and
     * as it was. With `deleted`, what the deletion took out comes back at once, as chosen; otherwise it arrives from the
     * server. Answers the transaction and its write's ID, whose outcome reports what was skipped.
     */
    recover(
      unit: { unitId: string; rootId: string },
      choice: RecoveryChoice = {},
      deleted?: Deleted,
    ) {
      const mutation = envelope("trash.recover", { unitId: unit.unitId, ...choice });
      const transaction = createTransaction({
        mutationFn: async ({ transaction: written }) => {
          await writer.persist(written, [{ key: unit.rootId, mutation }]);
        },
      });
      transaction.mutate(() => {
        if (trashUnits.has(unit.unitId)) trashUnits.delete(unit.unitId);
        if (!deleted) return;
        const back = deleted.containers
          .filter((row) => !containers.has(row.id))
          .map((row): Container => {
            if (row.id !== unit.rootId) return row;
            const { id, kind, description } = row;
            return {
              id,
              kind,
              description,
              parentId: choice.parentId === undefined ? row.parentId : choice.parentId,
              name: choice.name ?? row.name,
            };
          });
        if (back.length > 0) containers.insert(back);
        const lists = new Set(back.map((row) => row.id));
        const entries = deleted.entries.filter(
          (entry) =>
            lists.has(entry.listId) && !memberships.has(membershipKey(entry.listId, entry.albumId)),
        );
        if (entries.length > 0) memberships.insert(entries);
      });
      return { transaction, mutationId: mutation.mutationId };
    },
  };
}

export type Trash = ReturnType<typeof createTrash>;
