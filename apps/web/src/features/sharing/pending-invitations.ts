// How many sharing invitations wait for the signed-in person (DS-31, FR-07.5): the sidebar shows Invitations, with
// this count, only while some are pending. Another account's invitation can't reach this client's stream, so the
// count is read on load, when the window regains focus, every minute, and after the person answers one. One store
// for the page, read through `usePendingInvitations()`.

import { api } from "@/api";
import { useEffect, useSyncExternalStore } from "react";

const everyMs = 60_000;

let count = 0;
const listeners = new Set<() => void>();
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;

/** Reads the count again; the sidebar and the inbox update when it arrives. */
export function refreshPendingInvitations(): void {
  api.v1.invitations
    .get()
    .then(({ data }) => {
      if (!data || data.invitations.length === count) return data;
      count = data.invitations.length;
      for (const listener of listeners) listener();
      return data;
    })
    .catch(() => {});
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The pending invitations' count, kept current while a component shows it. */
export function usePendingInvitations(): number {
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
    () => count,
    () => 0,
  );
}
