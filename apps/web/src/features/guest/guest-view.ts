// A guest's presentation of a share (FR-11.9, DS-72): sort, direction, grouping and layout, for the visit only. Kept in
// the tab's session, per link, so a reload keeps them and a new visit starts from DS-44's defaults. Never sent
// anywhere: the owner's choices aren't shared, and a guest's aren't saved.

import { useCallback, useSyncExternalStore } from "react";

import { appViewDefaults } from "@tonaris/domain";

export type GuestView = {
  sort: "year" | "name";
  dir: "asc" | "desc";
  grouped: boolean;
  layout: "rows" | "grid";
};

export const guestDefaults: GuestView = {
  sort: appViewDefaults.listSortMode === "name" ? "name" : "year",
  dir: appViewDefaults.listSortDir,
  grouped: appViewDefaults.grouped,
  layout: appViewDefaults.layout,
};

const keyOf = (token: string) => `tonaris:guest-view:${token}`;
const listeners = new Set<() => void>();
/** The last read, by stored text, so the snapshot is stable between reads. */
const cache = new Map<string, { text: string | null; view: GuestView }>();

function read(token: string): GuestView {
  let text: string | null = null;
  try {
    text = sessionStorage.getItem(keyOf(token));
  } catch {
    // Not kept; the defaults apply.
  }
  const cached = cache.get(token);
  if (cached?.text === text) return cached.view;
  let view = guestDefaults;
  try {
    const value: unknown = text ? JSON.parse(text) : undefined;
    if (typeof value === "object" && value !== null) {
      const stored = value as Partial<Record<keyof GuestView, unknown>>;
      view = {
        sort: stored.sort === "name" ? "name" : "year",
        dir: stored.dir === "desc" ? "desc" : "asc",
        grouped: stored.grouped === true,
        layout: stored.layout === "grid" ? "grid" : "rows",
      };
    }
  } catch {
    view = guestDefaults;
  }
  cache.set(token, { text, view });
  return view;
}

export function useGuestView(token: string): [GuestView, (change: Partial<GuestView>) => void] {
  const view = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(token),
    () => guestDefaults,
  );
  const change = useCallback(
    (next: Partial<GuestView>) => {
      try {
        sessionStorage.setItem(keyOf(token), JSON.stringify({ ...read(token), ...next }));
      } catch {
        // Not kept beyond this render.
      }
      for (const listener of listeners) listener();
    },
    [token],
  );
  return [view, change];
}
