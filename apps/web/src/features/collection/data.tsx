// The collection as the sidebar and the views read it: the tree of folders and lists, the albums, each list's
// entries and album count, Unsorted's albums, and the person's view choices, defaults and manual order, from the
// sync client's collections, live (FR-09.1, FR-11.8). Optimistic writes show at once. Built once for the workspace,
// so the tree and the view share one pass over the data. The tree orders each level as its folder's view is sorted,
// and the top level as the root is (decided 23 October 2026), manual order included.

import { useSyncClient } from "@/features/sync/sync-provider";
import { useLiveQuery } from "@tanstack/react-db";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  appViewDefaults,
  unsetView,
  type Album,
  type Membership,
  type ViewDefaults,
  type ViewPrefs,
} from "@tonaris/domain";

import { takeDeviceGridViews } from "../shell/device";
import { useCollectionUi } from "./collection-ui";
import { sortContainers, type Keys } from "./order";
import { presentationOf } from "./presentation";
import { buildTree, type Tree } from "./tree";

export type CollectionData = {
  tree: Tree;
  /** Each list's album count. */
  counts: ReadonlyMap<string, number>;
  unsorted: number;
  albums: number;
  albumsById: ReadonlyMap<string, Album>;
  /** Each list's entries. */
  entriesByList: ReadonlyMap<string, readonly Membership[]>;
  /** The albums in no list (FR-01.9). */
  unsortedAlbums: readonly Album[];
  /** The person's remembered choices, by view key (FR-11.7). */
  views: ReadonlyMap<string, ViewPrefs>;
  /** Their account defaults; DS-44's until the first snapshot or until they save their own. */
  defaults: ViewDefaults;
  /** Their manual order: each view's keys, by view key (TS-16). */
  keys: ReadonlyMap<string, Keys>;
  /** Whether the first snapshot has loaded, so a missing folder is really missing. */
  ready: boolean;
};

const empty: CollectionData = {
  tree: buildTree([]),
  counts: new Map(),
  unsorted: 0,
  albums: 0,
  albumsById: new Map(),
  entriesByList: new Map(),
  unsortedAlbums: [],
  views: new Map(),
  defaults: appViewDefaults,
  keys: new Map(),
  ready: false,
};

const CollectionDataContext = createContext<CollectionData>(empty);

export function CollectionDataProvider({ children }: { children: ReactNode }) {
  const client = useSyncClient();
  const containers = useLiveQuery(() => client?.containers, [client]);
  const memberships = useLiveQuery(() => client?.memberships, [client]);
  const albums = useLiveQuery(() => client?.albums, [client]);
  const viewRows = useLiveQuery(() => client?.views, [client]);
  const defaultRows = useLiveQuery(() => client?.defaults, [client]);
  const positionRows = useLiveQuery(() => client?.positions, [client]);
  // The rows themselves, which change only when the collections do.
  const containerData = containers.data;
  const membershipData = memberships.data;
  const albumData = albums.data;
  const viewData = viewRows.data;
  const defaultData = defaultRows.data;
  const positionData = positionRows.data;
  const ready =
    containers.isReady &&
    memberships.isReady &&
    albums.isReady &&
    viewRows.isReady &&
    defaultRows.isReady &&
    positionRows.isReady;

  const value = useMemo<CollectionData>(() => {
    const entries = membershipData ?? [];
    const owned = albumData ?? [];
    const entriesByList = new Map<string, Membership[]>();
    const listed = new Set<string>();
    for (const entry of entries) {
      const inList = entriesByList.get(entry.listId);
      if (inList) inList.push(entry);
      else entriesByList.set(entry.listId, [entry]);
      listed.add(entry.albumId);
    }
    const unsortedAlbums = owned.filter((album) => !listed.has(album.id));
    const views = new Map((viewData ?? []).map((view) => [view.viewKey, view]));
    const defaults = defaultData?.[0] ?? appViewDefaults;
    const keys = new Map<string, Map<string, string>>();
    for (const { viewKey, itemId, key } of positionData ?? []) {
      const inView = keys.get(viewKey);
      if (inView) inView.set(itemId, key);
      else keys.set(viewKey, new Map([[itemId, key]]));
    }
    const tree = buildTree(containerData ?? [], (siblings, parentId) => {
      const viewKey = parentId ?? "root";
      const { sortMode: mode, sortDir: dir } = presentationOf(
        "containers",
        views.get(viewKey),
        defaults,
      );
      return sortContainers(siblings, { mode, dir }, keys.get(viewKey));
    });
    return {
      tree,
      counts: new Map([...entriesByList].map(([listId, inList]) => [listId, inList.length])),
      unsorted: unsortedAlbums.length,
      albums: owned.length,
      albumsById: new Map(owned.map((album) => [album.id, album])),
      entriesByList,
      unsortedAlbums,
      views,
      defaults,
      keys,
      ready,
    };
  }, [containerData, membershipData, albumData, viewData, defaultData, positionData, ready]);

  useDeviceLayoutsSaved(value);

  return <CollectionDataContext value={value}>{children}</CollectionDataContext>;
}

export function useCollectionData(): CollectionData {
  return useContext(CollectionDataContext);
}

/**
 * Saves to the account, once the collection has loaded, the Grid layouts this device kept for lists and Unsorted
 * before layouts were synced (TON-34; FR-11.8). A view that is gone, or that has a layout of its own by now, keeps
 * what it has. The device then forgets them.
 */
function useDeviceLayoutsSaved({ ready, tree, views }: CollectionData): void {
  const client = useSyncClient();
  const { accountId } = useCollectionUi();
  const done = useRef(false);
  useEffect(() => {
    if (!client || !ready || done.current) return;
    done.current = true;
    for (const viewKey of takeDeviceGridViews(accountId)) {
      const isList = viewKey === "unsorted" || tree.byId.get(viewKey)?.kind === "list";
      const own = views.get(viewKey);
      if (!isList || (own?.layout ?? null) !== null) continue;
      const write = own
        ? client.views.update(viewKey, (draft) => {
            draft.layout = "grid";
          })
        : client.views.insert({ ...unsetView(viewKey), layout: "grid" });
      write.isPersisted.promise.catch(() => {});
    }
  }, [client, ready, accountId, tree, views]);
}
