// The signed-in workspace's sync client (TS-24): one per tab, for the account, sharing one stream with the
// account's other tabs and keeping unsent writes and conflicts in this browser (TS-22, TS-23). A session that ends
// elsewhere, signed out in another tab or revoked, ends the stream; the workspace then goes to sign-in.

import { browserFetch, createSyncClient, type SyncClient } from "@/client/sync/client";
import { indexedDbPersistence } from "@/client/sync/persistence";
import { browserTabs } from "@/client/sync/tabs";
import { apiUrl, testHooks } from "@/config";
import { forgetAccount } from "@/features/account/session";
import { useRouter } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Account } from "@tonaris/domain";

declare global {
  interface Window {
    /** The page's sync client, for the browser tests only (`TEST_HOOKS`). */
    tonarisSync?: SyncClient;
  }
}

const SyncContext = createContext<SyncClient | undefined>(undefined);

export function SyncProvider({ account, children }: { account: Account; children: ReactNode }) {
  const router = useRouter();
  const [client, setClient] = useState<SyncClient>();

  useEffect(() => {
    const created = createSyncClient({
      apiUrl,
      fetch: browserFetch,
      persistence: indexedDbPersistence(account.id),
      tabs: browserTabs(account.id),
    });
    const off = created.engine.onStatus((status) => {
      if (status !== "signed_out") return;
      forgetAccount();
      void router.navigate({ to: "/sign-in" });
    });
    // Back online, connect and resend at once rather than after the current delay.
    const online = () => {
      created.engine.reconnect();
      created.outbox.wake();
    };
    window.addEventListener("online", online);
    created.start();
    if (testHooks) window.tonarisSync = created;
    // The client holds locks, a channel and timers, so it is made here rather than during render, which may run
    // twice; rendering it needs state.
    // oxlint-disable-next-line react/set-state-in-effect
    setClient(created);
    return () => {
      window.removeEventListener("online", online);
      off();
      void created.stop();
      if (window.tonarisSync === created) delete window.tonarisSync;
    };
  }, [account.id, router]);

  return <SyncContext value={client}>{children}</SyncContext>;
}

/** The workspace's sync client; undefined for the moment before it is created. */
export function useSyncClient(): SyncClient | undefined {
  return useContext(SyncContext);
}
