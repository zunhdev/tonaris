// The AI clients' requests waiting for the signed-in person's approval (DS-86, TS-64): the sidebar shows Approvals, with
// their count, only while some wait, and Settings → Connections lists them. An agent asks through MCP, which no stream
// of this client carries, so they are read on load, when the window regains focus, every 30 seconds, and after the
// person decides one. One store for the page, read through `usePendingApprovals()`.

import { api } from "@/api";
import { useEffect, useSyncExternalStore } from "react";

import type { PendingApprovals } from "@tonaris/domain";

const everyMs = 30_000;

type Pending = PendingApprovals["approvals"];
let pending: Pending = [];
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/** Reads the requests again; the sidebar and Settings update when they arrive. */
export function refreshPendingApprovals(): void {
  api.v1.approvals
    .get()
    .then(({ data }) => {
      if (!data) return data;
      const same =
        data.approvals.length === pending.length &&
        data.approvals.every((approval, index) => approval.id === pending[index]?.id);
      if (same) return data;
      pending = data.approvals;
      for (const listener of listeners) listener();
      return data;
    })
    .catch(() => {});
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const none: Pending = [];

/** The requests waiting for a decision, oldest first, kept current while a component shows them. */
export function usePendingApprovals(): Pending {
  useEffect(() => {
    users += 1;
    if (users === 1) {
      refreshPendingApprovals();
      timer = setInterval(refreshPendingApprovals, everyMs);
      globalThis.addEventListener("focus", refreshPendingApprovals);
    }
    return () => {
      users -= 1;
      if (users > 0) return;
      clearInterval(timer);
      globalThis.removeEventListener("focus", refreshPendingApprovals);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => none,
  );
}
