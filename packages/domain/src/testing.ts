// An in-memory `CollectionStore` for the command tests: the same contract the database layer implements on the
// owner's write transaction (packages/db/src/sync.ts). Import from tests only.

import type { Album } from "./albums";
import type { CollectionStore, StoredAlbum } from "./commands";
import type { Container, StoredContainer } from "./containers";
import { membershipKey, type Membership } from "./memberships";

/** The entries of `values` that are set: an update leaves undefined fields as they are. */
const defined = (values: object) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

type StoredMembership = Membership & { ownerId: string };

/**
 * A store over plain maps, which tests inspect directly. Albums are active unless they say otherwise; entries are
 * keyed by `membershipKey`.
 */
export function memoryStore({
  albums = [],
  containers = [],
  memberships = [],
}: {
  albums?: (Album & { ownerId: string; trashed?: boolean })[];
  containers?: StoredContainer[];
  memberships?: StoredMembership[];
} = {}) {
  const albumRows = new Map<string, StoredAlbum>(
    albums.map((album) => [album.id, { trashed: false, ...album }]),
  );
  const containerRows = new Map(containers.map((container) => [container.id, { ...container }]));
  const membershipRows = new Map(
    memberships.map((entry) => [membershipKey(entry.listId, entry.albumId), { ...entry }]),
  );

  const activeChildren = (ownerId: string, parentId: string | null): StoredContainer[] =>
    [...containerRows.values()].filter(
      (row) => row.ownerId === ownerId && row.parentId === parentId && !row.trashed,
    );
  const depthBelow = (row: StoredContainer): number =>
    1 + Math.max(0, ...activeChildren(row.ownerId, row.id).map(depthBelow));

  const store: CollectionStore = {
    findAlbum: (id) => Promise.resolve(albumRows.has(id) ? { ...albumRows.get(id)! } : undefined),
    insertAlbum: (album) => {
      albumRows.set(album.id, { ...album, trashed: false });
      return Promise.resolve();
    },
    updateAlbum: (id, values) => {
      albumRows.set(id, { ...albumRows.get(id)!, ...defined(values) });
      return Promise.resolve();
    },

    findContainer: (id) =>
      Promise.resolve(containerRows.has(id) ? { ...containerRows.get(id)! } : undefined),
    containerPath: (id) => {
      const path: string[] = [];
      for (let row = containerRows.get(id); row; row = containerRows.get(row.parentId ?? "")) {
        path.push(row.id);
      }
      return Promise.resolve(path);
    },
    subtreeDepth: (id) => {
      const row = containerRows.get(id);
      return Promise.resolve(row ? depthBelow(row) : 0);
    },
    activeChildren: (ownerId, parentId) =>
      Promise.resolve(
        activeChildren(ownerId, parentId).map(
          ({ id, kind, name, parentId: parent }): Container => ({
            id,
            kind,
            parentId: parent,
            name,
          }),
        ),
      ),
    countContainers: (ownerId) =>
      Promise.resolve([...containerRows.values()].filter((row) => row.ownerId === ownerId).length),
    insertContainer: (container) => {
      containerRows.set(container.id, { ...container, trashed: false });
      return Promise.resolve();
    },
    updateContainer: (id, values) => {
      containerRows.set(id, { ...containerRows.get(id)!, ...defined(values) });
      return Promise.resolve();
    },

    findMembership: (listId, albumId) => {
      const row = membershipRows.get(membershipKey(listId, albumId));
      if (!row) return Promise.resolve(undefined);
      const { ownerId: _, ...membership } = row;
      return Promise.resolve(membership);
    },
    countMemberships: (ownerId) =>
      Promise.resolve([...membershipRows.values()].filter((row) => row.ownerId === ownerId).length),
    insertMembership: (membership) => {
      membershipRows.set(membershipKey(membership.listId, membership.albumId), { ...membership });
      return Promise.resolve();
    },
    deleteMembership: (listId, albumId) => {
      membershipRows.delete(membershipKey(listId, albumId));
      return Promise.resolve();
    },
  };
  return {
    store,
    albums: albumRows,
    containers: containerRows,
    memberships: membershipRows,
  };
}
