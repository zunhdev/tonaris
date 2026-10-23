// An in-memory `CollectionStore` for the command tests: the same contract the database layer implements on the
// owner's write transaction (packages/db/src/sync.ts). Import from tests only.

import type { Album } from "./albums";
import type { CollectionStore, StoredAlbum } from "./commands";
import type { Container, StoredContainer } from "./containers";
import { membershipKey, type Membership } from "./memberships";
import { positionKey, type Position } from "./positions";
import type { ViewDefaults, ViewPrefs } from "./views";

/** The entries of `values` that are set: an update leaves undefined fields as they are. */
const defined = (values: object) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

type StoredMembership = Membership & { ownerId: string };

/** A view preference's key in `memoryStore`: the person's ID and the view key, joined by a colon. */
export const viewRowKey = (personId: string, viewKey: string) => `${personId}:${viewKey}`;

/** A position's key in `memoryStore`: the person's ID, the view key and the item's ID, joined by colons. */
export const positionRowKey = (personId: string, viewKey: string, itemId: string) =>
  `${personId}:${positionKey(viewKey, itemId)}`;

/**
 * A store over plain maps, which tests inspect directly. Albums are active unless they say otherwise; entries are
 * keyed by `membershipKey`, view preferences by `viewRowKey`, positions by `positionRowKey`, and defaults by the
 * person's ID.
 */
export function memoryStore({
  albums = [],
  containers = [],
  memberships = [],
  views = [],
  defaults = [],
  positions = [],
}: {
  albums?: (Album & { ownerId: string; trashed?: boolean })[];
  containers?: StoredContainer[];
  memberships?: StoredMembership[];
  views?: (ViewPrefs & { personId: string })[];
  defaults?: (ViewDefaults & { personId: string })[];
  positions?: (Position & { personId: string })[];
} = {}) {
  const albumRows = new Map<string, StoredAlbum>(
    albums.map((album) => [album.id, { trashed: false, ...album }]),
  );
  const containerRows = new Map(containers.map((container) => [container.id, { ...container }]));
  const membershipRows = new Map(
    memberships.map((entry) => [membershipKey(entry.listId, entry.albumId), { ...entry }]),
  );
  const viewRows = new Map<string, ViewPrefs>(
    views.map(({ personId, ...prefs }) => [viewRowKey(personId, prefs.viewKey), prefs]),
  );
  const defaultRows = new Map<string, ViewDefaults>(
    defaults.map(({ personId, ...values }) => [personId, values]),
  );
  const positionRows = new Map<string, Position & { personId: string }>(
    positions.map((row) => [positionRowKey(row.personId, row.viewKey, row.itemId), { ...row }]),
  );
  const inActiveList = (albumId: string) =>
    [...membershipRows.values()].some(
      (entry) => entry.albumId === albumId && containerRows.get(entry.listId)?.trashed === false,
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

    findViewPrefs: (personId, viewKey) => {
      const row = viewRows.get(viewRowKey(personId, viewKey));
      return Promise.resolve(row && { ...row });
    },
    saveViewPrefs: (personId, prefs) => {
      viewRows.set(viewRowKey(personId, prefs.viewKey), { ...prefs });
      return Promise.resolve();
    },
    deleteViewPrefs: (personId, viewKey) => {
      viewRows.delete(viewRowKey(personId, viewKey));
      return Promise.resolve();
    },
    findDefaults: (personId) => {
      const row = defaultRows.get(personId);
      return Promise.resolve(row && { ...row });
    },
    saveDefaults: (personId, values) => {
      defaultRows.set(personId, { ...values });
      return Promise.resolve();
    },

    findPositions: (personId, viewKey, itemIds) =>
      Promise.resolve(
        new Map(
          itemIds.flatMap((itemId) => {
            const row = positionRows.get(positionRowKey(personId, viewKey, itemId));
            return row ? [[itemId, row.key] as const] : [];
          }),
        ),
      ),
    savePosition: (personId, position) => {
      positionRows.set(positionRowKey(personId, position.viewKey, position.itemId), {
        ...position,
        personId,
      });
      return Promise.resolve();
    },
    deletePosition: (personId, viewKey, itemId) =>
      Promise.resolve(positionRows.delete(positionRowKey(personId, viewKey, itemId))),
    firstKey: (personId, viewKey) => {
      const keys = [...positionRows.values()]
        .filter((row) => row.personId === personId && row.viewKey === viewKey)
        .map((row) => row.key)
        .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return Promise.resolve(keys[0]);
    },
    viewItems: (personId, viewKey, kind) => {
      if (kind === "containers") {
        const parentId = viewKey === "root" ? null : viewKey;
        return Promise.resolve(new Set(activeChildren(personId, parentId).map((row) => row.id)));
      }
      const active = [...albumRows.values()].filter((album) => !album.trashed);
      if (viewKey === "unsorted") {
        return Promise.resolve(
          new Set(
            active
              .filter((album) => album.ownerId === personId && !inActiveList(album.id))
              .map((album) => album.id),
          ),
        );
      }
      const listed = new Set(
        [...membershipRows.values()]
          .filter((entry) => entry.listId === viewKey)
          .map((entry) => entry.albumId),
      );
      return Promise.resolve(
        new Set(active.filter((album) => listed.has(album.id)).map((a) => a.id)),
      );
    },
    inActiveList: (albumId) => Promise.resolve(inActiveList(albumId)),
  };
  return {
    store,
    albums: albumRows,
    containers: containerRows,
    memberships: membershipRows,
    views: viewRows,
    defaults: defaultRows,
    positions: positionRows,
  };
}
