// The sharing invitations waiting for the signed-in person (DS-31, FR-07.5): the sidebar shows Invitations, with
// their count, only while some are pending, and each new one is announced (TON-129). Another account's invitation
// can't reach this client's stream, so they are read on load, when the window regains focus, every minute, and after
// the person answers one. One store for the page, read through `usePendingInvitations()` and
// `usePendingInvitationList()`.

import { api } from "@/api";
import { useEffect, useSyncExternalStore } from "react";

import type { Invitation } from "@tonaris/domain";

const everyMs = 60_000;

/** Undefined until the first read answers. */
let invitations: Invitation[] | undefined;
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const idsOf = (list: readonly Invitation[] | undefined) => list?.map((each) => each.id).join(",");

/** Reads them again; the sidebar, the inbox and the announcements update when they arrive. */
export function refreshPendingInvitations(): void {
  api.v1.invitations
    .get()
    .then(({ data }) => {
      if (!data || idsOf(data.invitations) === idsOf(invitations)) return data;
      invitations = data.invitations;
      for (const listener of listeners) listener();
      return data;
    })
    .catch(() => {});
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Keeps the invitations current while a component shows them. */
function useFollowed(): Invitation[] | undefined {
  useEffect(() => {
    users += 1;
    if (users === 1) {
      refreshPendingInvitations();
      timer = setInterval(refreshPendingInvitations, everyMs);
      globalThis.addEventListener("focus", refreshPendingInvitations);
    }
    return () => {
      users -= 1;
      if (users > 0) return;
      clearInterval(timer);
      globalThis.removeEventListener("focus", refreshPendingInvitations);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => invitations,
    () => undefined,
  );
}

/** The pending invitations' count. */
export function usePendingInvitations(): number {
  return useFollowed()?.length ?? 0;
}

/** The pending invitations, oldest first; undefined until first read. */
export function usePendingInvitationList(): Invitation[] | undefined {
  return useFollowed();
}
