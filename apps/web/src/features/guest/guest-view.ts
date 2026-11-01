// A guest's presentation of a share (FR-11.9, DS-72): sort, direction, grouping and layout, for the visit only. Kept in
// the tab's session, per link, so a reload keeps them and a new visit starts from DS-44's defaults. Never sent
// anywhere: the owner's choices aren't shared, and a guest's aren't saved.

import { readText, storageOf, writeJson } from "@/features/shell/storage";
import { useCallback, useSyncExternalStore } from "react";

import {
  appViewDefaults,
  listSortModes,
  sortDirections,
  viewLayouts,
  type ListSortMode,
  type SortDirection,
  type ViewLayout,
} from "@tonaris/domain";

/** A guest sorts by year or name: manual order is the owner's arrangement, which guests see as saved. */
type GuestSort = Exclude<ListSortMode, "manual">;

export type GuestView = {
  sort: GuestSort;
  dir: SortDirection;
  grouped: boolean;
  layout: ViewLayout;
};

const guestSorts = listSortModes.filter((mode): mode is GuestSort => mode !== "manual");

/** `value` if it is one of `options`. */
const oneOf = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
  options.find((option) => option === value);

export const guestDefaults: GuestView = {
  sort: appViewDefaults.listSortMode === "name" ? "name" : "year",
  dir: appViewDefaults.listSortDir,
  grouped: appViewDefaults.grouped,
  layout: appViewDefaults.layout,
};

const keyOf = (token: string) => `tonaris:guest-view:${token}`;
const listeners = new Set<() => void>();
/** The last read, by stored text, so the snapshot is stable between reads. */
const cache = new Map<string, { text: string | undefined; view: GuestView }>();

/** A stored view, each choice it can't read as DS-44's first default. */
export function guestViewOf(text: string | undefined): GuestView {
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : undefined;
  } catch {
    return guestDefaults;
  }
  if (typeof value !== "object" || value === null) return guestDefaults;
  const stored = new Map<string, unknown>(Object.entries(value));
  return {
    sort: oneOf(guestSorts, stored.get("sort")) ?? "year",
    dir: oneOf(sortDirections, stored.get("dir")) ?? "asc",
    grouped: stored.get("grouped") === true,
    layout: oneOf(viewLayouts, stored.get("layout")) ?? "rows",
  };
}

function read(token: string): GuestView {
  const text = readText(keyOf(token), storageOf(true));
  const cached = cache.get(token);
  if (cached && cached.text === text) return cached.view;
  const view = guestViewOf(text);
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
      // Without storage, it isn't kept beyond this render.
      writeJson(keyOf(token), { ...read(token), ...next }, storageOf(true));
      for (const listener of listeners) listener();
    },
    [token],
  );
  return [view, change];
}
