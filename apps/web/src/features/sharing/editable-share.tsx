// A share the person edits, on screen (TS-24, DS-70 for editors; TON-191). On `/shared/{root}`, on the desktop, when
// Shared with me says they can edit it, a share client holds it (share-engine.ts), and everything below works on it as
// on the person's own collection: the views, the inspector, the dialogs, captures and save states. The sidebar and the
// palette keep showing the person's own (`OwnCollection`). The tree below is the same either way, so moving into or
// out of a share remounts nothing. A read that says the role is now view, or that access ended, reads Shared with me
// again, which hands the view back to the viewer's page; edits that weren't saved by then are reported, not lost
// silently (FR-09.3).

import { browserFetch, createSyncClient } from "@/client/sync/client";
import {
  browserNetwork,
  browserPage,
  resumeWhenBack,
  watchConnection,
} from "@/client/sync/connection";
import { indexedDbPersistence } from "@/client/sync/persistence";
import { createShareEngine } from "@/client/sync/share-engine";
import { browserTabs } from "@/client/sync/tabs";
import { useNarrowScreen } from "@/common/media";
import { apiUrl } from "@/config";
import { ActiveCollectionData } from "@/features/collection/data";
import { NamingProvider } from "@/features/collection/name-dialog";
import { CollectionPlaceContext, type CollectionPlace } from "@/features/collection/place";
import { useNotify } from "@/features/sync/notify";
import { ActiveSyncProvider, useOwnSyncClient, type Sync } from "@/features/sync/sync-provider";
import { useLocation } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { useSharedEntries } from "./shared-entries";

type Share = Sync & { rootId: string };

/** How long a share's client keeps sending once the person leaves it. */
const settleMs = 30_000;

/** Edits to a share that weren't saved when the person could no longer edit it. */
type Lost = { name: string; count: number };

const LostContext = createContext<{ lost: Lost | undefined; seen: () => void }>({
  lost: undefined,
  seen: () => {},
});

export function ActiveCollectionProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const own = useOwnSyncClient();
  const narrow = useNarrowScreen();
  const rootId = useLocation({
    select: (location) => /^\/shared\/([^/]+)$/.exec(location.pathname)?.[1],
  });
  const { entries, reread } = useSharedEntries();
  const entry =
    rootId === undefined ? undefined : entries?.find((each) => each.containerId === rootId);
  // Phones only view (X-04).
  const editable = !narrow && entry?.available === true && entry.role === "edit";
  const name = entry?.name ?? "the share";
  const [share, setShare] = useState<Share>();
  const [lost, setLost] = useState<Lost>();

  useEffect(() => {
    if (!editable || !own || rootId === undefined) return undefined;
    const engine = createShareEngine({ apiUrl, fetch: browserFetch, rootId });
    const client = createSyncClient({
      apiUrl,
      fetch: browserFetch,
      engine,
      // The share's content in the person's own presentation (FR-07.17).
      personal: {
        views: own.views,
        defaults: own.defaults,
        positions: own.positions,
        trashUnits: own.trashUnits,
        references: own.references,
        arrange: own.arrange,
      },
      // Kept apart from the person's own unsent writes, and owned by this tab, so after a reload, or the next time
      // the share opens, the new tab adopts and sends what this one left (TS-22).
      persistence: indexedDbPersistence(`${accountId}~${rootId}`),
      tabs: browserTabs(`${accountId}~${rootId}`),
    });
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      const count = client.states.open().length;
      if (count > 0) setLost({ name, count });
      reread();
    };
    const offRead = engine.onRead(({ role }) => {
      if (role !== "edit") end();
    });
    const offGone = engine.onUnavailable(end);
    // The share's own connection, as the workspace reports it (DS-81): its stream, not the person's own.
    const connection = watchConnection({
      engine,
      network: browserNetwork(),
      page: browserPage(),
    });
    // Back online or on screen, it reads, follows and resends at once, as the person's own client does (TON-137).
    const unwatch = resumeWhenBack(() => client.resume());
    client.start();
    // The client holds a stream, collections and timers, so it is made here rather than during render.
    // oxlint-disable-next-line react/set-state-in-effect
    setShare({ rootId, client, connection });
    return () => {
      offRead();
      offGone();
      unwatch();
      connection.stop();
      // Leaving the share with writes still on their way: they're sent first, for up to 30 s.
      void client.settle(settleMs).finally(() => void client.stop());
      setShare(undefined);
    };
  }, [editable, own, rootId, accountId, reread, name]);

  const active = editable && share?.rootId === rootId ? share : undefined;
  const ownerName = entry?.owner.displayName ?? null;
  const place = useMemo<CollectionPlace>(
    () => (active ? { kind: "share", rootId: active.rootId, ownerName } : { kind: "own" }),
    [active, ownerName],
  );
  const loss = useMemo(() => ({ lost, seen: () => setLost(undefined) }), [lost]);
  return (
    <LostContext value={loss}>
      <CollectionPlaceContext value={place}>
        <ActiveSyncProvider active={active}>
          <ActiveCollectionData client={active?.client}>
            <NamingProvider>{children}</NamingProvider>
          </ActiveCollectionData>
        </ActiveSyncProvider>
      </CollectionPlaceContext>
    </LostContext>
  );
}

/** Says, once, that edits to a share weren't saved because the person could no longer edit it (FR-09.3). */
export function LostShareEdits() {
  const { lost, seen } = useContext(LostContext);
  const notify = useNotify();
  useEffect(() => {
    if (!lost || !notify) return;
    const changes = lost.count === 1 ? "1 change wasn't" : `${lost.count} changes weren't`;
    notify.problem({
      id: `lost-share-edits-${lost.name}`,
      title: `${changes} saved`,
      description: `You can no longer edit "${lost.name}".`,
      tone: "danger",
      actions: [],
    });
    seen();
  }, [lost, notify, seen]);
  return null;
}
