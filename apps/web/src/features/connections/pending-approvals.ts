// The AI clients' requests waiting for the signed-in person's approval (DS-86, TS-64): the sidebar shows Approvals, with
// their count, only while some wait, and Settings → Connections lists them. An agent asks through MCP, which no stream
// of this client carries, so they are read on load, when the window regains focus, every 30 seconds, and after the
// person decides one. One store for the page, read through `usePendingApprovals()`.

import { api } from "@/api";
import { createPolledStore } from "@/features/shell/polled-store";

import type { PendingApprovals } from "@tonaris/domain";

type Pending = PendingApprovals["approvals"];

const store = createPolledStore<Pending>({
  read: () => api.v1.approvals.get().then(({ data }) => data?.approvals),
  everyMs: 30_000,
});

/** Reads the requests again; the sidebar and Settings update when they arrive. */
export const refreshPendingApprovals = store.refresh;

const none: Pending = [];

/** The requests waiting for a decision, oldest first, kept current while a component shows them. */
export function usePendingApprovals(): Pending {
  return store.useList() ?? none;
}
