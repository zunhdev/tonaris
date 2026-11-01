// The sharing invitations waiting for the signed-in person (DS-31, FR-07.5): the sidebar shows Invitations, with
// their count, only while some are pending, and each new one is announced (TON-129). Another account's invitation
// can't reach this client's stream, so they are read on load, when the window regains focus, every minute, and after
// the person answers one. One store for the page, read through `usePendingInvitations()` and
// `usePendingInvitationList()`.

import { api } from "@/api";
import { createPolledStore } from "@/features/shell/polled-store";

import type { Invitation } from "@tonaris/domain";

const store = createPolledStore<Invitation[]>({
  read: () => api.v1.invitations.get().then(({ data }) => data?.invitations),
  everyMs: 60_000,
});

/** Reads them again; the sidebar, the inbox and the announcements update when they arrive. */
export const refreshPendingInvitations = store.refresh;

/** The pending invitations' count. */
export function usePendingInvitations(): number {
  return store.useList()?.length ?? 0;
}

/** The pending invitations, oldest first; undefined until first read. */
export function usePendingInvitationList(): Invitation[] | undefined {
  return store.useList();
}
