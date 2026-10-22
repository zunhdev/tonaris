// The collection as the sidebar and the views read it: the tree of folders and lists, each list's album count, and
// Unsorted's, from the sync client's collections, live (FR-09.1). Optimistic writes show at once. Built once for the
// workspace, so the tree and the view share it.

import { useSyncClient } from "@/features/sync/sync-provider";
import { useLiveQuery } from "@tanstack/react-db";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { albumCounts, buildTree, unsortedCount, type Tree } from "./tree";

export type CollectionData = {
  tree: Tree;
  /** Each list's album count. */
  counts: ReadonlyMap<string, number>;
  unsorted: number;
  albums: number;
  /** Whether the first snapshot has loaded, so a missing folder is really missing. */
  ready: boolean;
};

const empty: CollectionData = {
  tree: buildTree([]),
  counts: new Map(),
  unsorted: 0,
  albums: 0,
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
    return {
      tree: buildTree(containers.data ?? []),
      counts: albumCounts(entries),
      unsorted: unsortedCount(owned, entries),
      albums: owned.length,
      ready,
    };
  }, [containers.data, memberships.data, albums.data, ready]);

  return <CollectionDataContext value={value}>{children}</CollectionDataContext>;
}

export function useCollectionData(): CollectionData {
  return useContext(CollectionDataContext);
}
