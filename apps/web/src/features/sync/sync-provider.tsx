// The signed-in workspace's sync client (TS-24): one per tab, for the account, sharing one stream with the
// account's other tabs and keeping unsent writes, conflicts and failures in this browser (TS-22, TS-23). A session
// that ends elsewhere, signed out in another tab or revoked, ends the stream; the workspace then goes to sign-in.
// With the client comes the connection as the workspace reports it: connected, reconnecting or offline (DS-81).

import { browserFetch, createSyncClient, type SyncClient } from "@/client/sync/client";
import {
  browserNetwork,
  browserPage,
  watchConnection,
  type Connection,
  type ConnectionWatch,
} from "@/client/sync/connection";
import { indexedDbPersistence } from "@/client/sync/persistence";
import { browserTabs } from "@/client/sync/tabs";
import { apiUrl, testHooks } from "@/config";
import { forgetAccount } from "@/features/account/session";
import { useRouter } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { Account } from "@tonaris/domain";

declare global {
  interface Window {
    /** The page's sync client, for the browser tests only (`TEST_HOOKS`). */
    tonarisSync?: SyncClient;
  }
}

type Sync = { client: SyncClient; connection: ConnectionWatch };

const SyncContext = createContext<Sync | undefined>(undefined);

export function SyncProvider({ account, children }: { account: Account; children: ReactNode }) {
  const router = useRouter();
  const [sync, setSync] = useState<Sync>();

  useEffect(() => {
    const created = createSyncClient({
      apiUrl,
      fetch: browserFetch,
      persistence: indexedDbPersistence(account.id),
      tabs: browserTabs(account.id),
    });
    const connection = watchConnection({
      engine: created.engine,
      network: browserNetwork(),
      page: browserPage(),
    });
    const off = created.engine.onStatus((status) => {
      if (status !== "signed_out") return;
      forgetAccount();
      void router.navigate({ to: "/sign-in" });
    });
    // Back online, or back on screen after the phone froze the page (TON-137), connect and resend at once rather
    // than after the current delay: captures too, which would otherwise wait out a backoff of up to 30 s.
    const online = () => created.resume();
    const shown = () => {
      if (!document.hidden) online();
    };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", shown);
    document.addEventListener("resume", shown);
    created.start();
    if (testHooks) window.tonarisSync = created;
    // The client holds locks, a channel and timers, so it is made here rather than during render, which may run
    // twice; rendering it needs state.
    // oxlint-disable-next-line react/set-state-in-effect
    setSync({ client: created, connection });
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", shown);
      document.removeEventListener("resume", shown);
      off();
      connection.stop();
      void created.stop();
      if (window.tonarisSync === created) delete window.tonarisSync;
    };
  }, [account.id, router]);

  return <SyncContext value={sync}>{children}</SyncContext>;
}

/** The workspace's sync client; undefined for the moment before it is created. */
export function useSyncClient(): SyncClient | undefined {
  return useContext(SyncContext)?.client;
}

/** The connection as the workspace reports it (DS-81); `connecting` until the client exists. */
export function useConnection(): Connection {
  const connection = useContext(SyncContext)?.connection;
  const subscribe = useCallback(
    (listener: () => void) => connection?.subscribe(listener) ?? (() => {}),
    [connection],
  );
  return useSyncExternalStore(subscribe, () => connection?.state ?? "connecting");
}
