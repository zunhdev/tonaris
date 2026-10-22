// The collection as the sidebar and the views read it: the tree of folders and lists, the albums, each list's
// entries and album count, and Unsorted's albums, from the sync client's collections, live (FR-09.1). Optimistic
// writes show at once. Built once for the workspace, so the tree and the view share one pass over the data.

import { useSyncClient } from "@/features/sync/sync-provider";
import { useLiveQuery } from "@tanstack/react-db";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Album, Membership } from "@tonaris/domain";

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
  ready: false,
};

const CollectionDataContext = createContext<CollectionData>(empty);

export function CollectionDataProvider({ children }: { children: ReactNode }) {
  const client = useSyncClient();
  const containers = useLiveQuery(() => client?.containers, [client]);
  const memberships = useLiveQuery(() => client?.memberships, [client]);
  const albums = useLiveQuery(() => client?.albums, [client]);
  const ready = containers.isReady && memberships.isReady && albums.isReady;

  const value = useMemo<CollectionData>(() => {
    const entries = memberships.data ?? [];
    const owned = albums.data ?? [];
    const entriesByList = new Map<string, Membership[]>();
    const listed = new Set<string>();
    for (const entry of entries) {
      const inList = entriesByList.get(entry.listId);
      if (inList) inList.push(entry);
      else entriesByList.set(entry.listId, [entry]);
      listed.add(entry.albumId);
    }
    const unsortedAlbums = owned.filter((album) => !listed.has(album.id));
    return {
      tree: buildTree(containers.data ?? []),
      counts: new Map([...entriesByList].map(([listId, inList]) => [listId, inList.length])),
      unsorted: unsortedAlbums.length,
      albums: owned.length,
      albumsById: new Map(owned.map((album) => [album.id, album])),
      entriesByList,
      unsortedAlbums,
      ready,
    };
  }, [containers.data, memberships.data, albums.data, ready]);

  return <CollectionDataContext value={value}>{children}</CollectionDataContext>;
}

export function useCollectionData(): CollectionData {
  return useContext(CollectionDataContext);
}
