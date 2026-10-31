// Shared with me's entries (DS-67, FR-07.13), read once for the workspace: for its page and for the sidebar's tree,
// which shows each with the folders and lists inside it (TON-130). Read from `GET /v1/shared` when the workspace
// opens, when the window regains focus, whenever the person's references change, here or on another device (their
// collection, TON-68), and on `reread`, as after a save its owner makes in a share the tree follows.

import { api } from "@/api";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useLiveQuery } from "@tanstack/react-db";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { SharedEntry } from "@tonaris/domain";

type SharedEntries = {
  /** Undefined until the first read answers. */
  entries: SharedEntry[] | undefined;
  reread: () => void;
};

const SharedEntriesContext = createContext<SharedEntries>({ entries: undefined, reread: () => {} });

export function useSharedEntries(): SharedEntries {
  return useContext(SharedEntriesContext);
}

export function SharedEntriesProvider({ children }: { children: ReactNode }) {
  const client = useSyncClient();
  const references = useLiveQuery(() => client?.references, [client]);
  // Which collections are kept, as text: a change here or on another device reads the list again.
  const kept = (references.data ?? [])
    .map((reference) => reference.containerId)
    .toSorted()
    .join(",");
  // The entries, with the read they came from: what was kept and how many times it was asked for again.
  const [loaded, setLoaded] = useState<{ read: string; entries: SharedEntry[] }>();
  const [revision, setRevision] = useState(0);
  const reread = useCallback(() => setRevision((count) => count + 1), []);
  useEffect(() => {
    let current = true;
    const read = `${kept}#${revision}`;
    api.v1.shared.get().then(
      ({ data }) => {
        if (current && data) setLoaded({ read, entries: data.entries });
        return data;
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [kept, revision]);
  const entries = loaded?.entries;
  useEffect(() => {
    globalThis.addEventListener("focus", reread);
    return () => globalThis.removeEventListener("focus", reread);
  }, [reread]);
  const value = useMemo(() => ({ entries, reread }), [entries, reread]);
  return <SharedEntriesContext value={value}>{children}</SharedEntriesContext>;
}
