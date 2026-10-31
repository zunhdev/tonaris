// What the workspace remembers on this device, not synced (DS-27, DS-30, DS-32, DS-43, DS-45, DS-75): which folders
// are expanded, the sidebar's width and whether it is hidden, the album inspector's width (TON-124), the last
// collection view visited, Viewing or Editing mode, what was opened lately and which palette commands are run most, which invitations were announced, a phone's Mine or Shared, and, for the tab's session, which groups
// are collapsed. Kept in localStorage and sessionStorage, which can be missing or refuse writes (private
// modes, blocked storage): then nothing is remembered, and nothing fails.

const storageOf = (session: boolean): Storage | undefined => {
  try {
    return session ? globalThis.sessionStorage : globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const read = (key: string, session = false): unknown => {
  try {
    const text = storageOf(session)?.getItem(key);
    return text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    return undefined;
  }
};

const write = (key: string, value: unknown, session = false): void => {
  try {
    storageOf(session)?.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; the workspace works the same.
  }
};

/** Which of a phone's Collection screen shows: the person's own folders and lists, or those shared (TON-134). */
export const phoneRootTab = {
  read(accountId: string): "mine" | "shared" {
    return read(`tonaris:phone-root:${accountId}`) === "shared" ? "shared" : "mine";
  },
  write(accountId: string, tab: "mine" | "shared"): void {
    write(`tonaris:phone-root:${accountId}`, tab);
  },
};

/** The pending invitations already announced on this device, so each is announced once (TON-129). */
export const announcedInvitations = {
  read(accountId: string): Set<string> {
    const value = read(`tonaris:announced-invitations:${accountId}`);
    return new Set(Array.isArray(value) ? value.filter((each) => typeof each === "string") : []);
  },
  write(accountId: string, ids: readonly string[]): void {
    write(`tonaris:announced-invitations:${accountId}`, ids);
  },
};

/** The folders expanded in the account's tree (DS-27). */
export const expandedFolders = {
  read(accountId: string): Set<string> {
    const value = read(`tonaris:tree:${accountId}`);
    return new Set(Array.isArray(value) ? value.filter((each) => typeof each === "string") : []);
  },
  write(accountId: string, folders: ReadonlySet<string>): void {
    write(`tonaris:tree:${accountId}`, [...folders]);
  },
};

/** A resizable pane's widths, in px. */
export type Widths = { readonly min: number; readonly max: number; readonly initial: number };

export const sidebarWidths = { min: 200, max: 360, initial: 240 } as const;

export type SidebarLayout = { width: number; hidden: boolean };

/** The sidebar's width, kept between 200 and 360 px, and whether it is hidden (DS-30). */
export const sidebarLayout = {
  read(): SidebarLayout {
    const value = read("tonaris:sidebar");
    const record = typeof value === "object" && value !== null ? value : {};
    const width = "width" in record && typeof record.width === "number" ? record.width : undefined;
    return {
      width: clampWidth(width ?? sidebarWidths.initial),
      hidden: "hidden" in record && record.hidden === true,
    };
  },
  write(layout: SidebarLayout): void {
    write("tonaris:sidebar", layout);
  },
};

/** A width kept within a pane's widths, the sidebar's unless others are given. */
export function clampWidth(width: number, widths: Widths = sidebarWidths): number {
  return Math.round(Math.min(widths.max, Math.max(widths.min, width)));
}

export const inspectorWidths = { min: 320, max: 560, initial: 380 } as const;

/** The album inspector's width, kept between 320 and 560 px (DS-30, TON-124). */
export const inspectorLayout = {
  read(): number {
    const value = read("tonaris:inspector");
    const width =
      typeof value === "object" &&
      value !== null &&
      "width" in value &&
      typeof value.width === "number"
        ? value.width
        : inspectorWidths.initial;
    return clampWidth(width, inspectorWidths);
  },
  write(width: number): void {
    write("tonaris:inspector", { width });
  },
};

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const collectionPath = new RegExp(`^/(?:c|unsorted|trash|shared|[fl]/${uuid})$`, "i");

/** Whether `path` is a collection view's: what `/` may return to (DS-32). */
export function isCollectionPath(path: string): boolean {
  return collectionPath.test(path);
}

/** The account's last collection view on this device, which `/` opens (DS-32). */
export const lastView = {
  read(accountId: string): string | undefined {
    const value = read(`tonaris:last-view:${accountId}`);
    return typeof value === "string" && isCollectionPath(value) ? value : undefined;
  },
  write(accountId: string, path: string): void {
    if (isCollectionPath(path)) write(`tonaris:last-view:${accountId}`, path);
  },
};

/**
 * The views kept as Grid on this device before layouts were saved to the account (TON-34), taken once: the device
 * forgets them, and the account remembers them instead (FR-11.8).
 */
export function takeDeviceGridViews(accountId: string): string[] {
  const key = `tonaris:layouts:${accountId}`;
  const value = read(key);
  if (value === undefined) return [];
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Kept; taking them again writes the same layouts.
  }
  const stored = typeof value === "object" && value !== null ? Object.entries(value) : [];
  return stored.flatMap(([view, layout]) => (layout === "grid" ? [view] : []));
}

/** The groups collapsed in each of the account's views, for this tab's session (DS-43). */
export const collapsedGroups = {
  read(accountId: string, viewKey: string): Set<string> {
    const value = read(`tonaris:collapsed:${accountId}:${viewKey}`, true);
    return new Set(Array.isArray(value) ? value.filter((each) => typeof each === "string") : []);
  },
  write(accountId: string, viewKey: string, groups: ReadonlySet<string>): void {
    write(`tonaris:collapsed:${accountId}:${viewKey}`, [...groups], true);
  },
};

export type Mode = "view" | "edit";

/** Viewing or Editing mode, app-wide (DS-45): kept on this device, per account, and not synced. */
export const editMode = {
  read(accountId: string): Mode {
    return read(`tonaris:mode:${accountId}`) === "edit" ? "edit" : "view";
  },
  write(accountId: string, mode: Mode): void {
    write(`tonaris:mode:${accountId}`, mode);
  },
};

/** A folder, list or album the person opened (DS-75). */
export type RecentItem = { kind: "folder" | "list" | "album"; id: string };

const isRecentKind = (kind: unknown): kind is RecentItem["kind"] =>
  kind === "folder" || kind === "list" || kind === "album";
const uuidPattern = new RegExp(`^${uuid}$`, "i");

/** How many opened items the device keeps: more than the palette shows, so deleted ones can drop out. */
export const recentLimit = 20;

/** `items` with `item` first, once, and no more than `recentLimit`. */
export function withRecent(items: readonly RecentItem[], item: RecentItem): RecentItem[] {
  return [item, ...items.filter((each) => each.id !== item.id)].slice(0, recentLimit);
}

const routeKinds: Record<string, RecentItem["kind"]> = { f: "folder", l: "list", a: "album" };

/** What visiting `pathname`, with `album` in the inspector, opened, in the order it was opened. */
export function openedItems(pathname: string, album: string | undefined): RecentItem[] {
  const [, prefix, id] = /^\/([fla])\/([^/]+)$/.exec(pathname) ?? [];
  const opened: RecentItem[] = [];
  const kind = prefix === undefined ? undefined : routeKinds[prefix];
  if (kind && id && uuidPattern.test(id)) opened.push({ kind, id });
  if (album !== undefined && uuidPattern.test(album)) opened.push({ kind: "album", id: album });
  return opened;
}

/** The folders, lists and albums the account opened on this device, newest first (DS-75). */
export const recentItems = {
  read(accountId: string): RecentItem[] {
    const value = read(`tonaris:recent:${accountId}`);
    if (!Array.isArray(value)) return [];
    return value.flatMap((each: unknown) =>
      typeof each === "object" &&
      each !== null &&
      "kind" in each &&
      isRecentKind(each.kind) &&
      "id" in each &&
      typeof each.id === "string"
        ? [{ kind: each.kind, id: each.id }]
        : [],
    );
  },
  record(accountId: string, opened: readonly RecentItem[]): void {
    if (opened.length === 0) return;
    write(`tonaris:recent:${accountId}`, opened.reduce(withRecent, recentItems.read(accountId)));
  },
};

/** How often the account ran each command from the palette on this device, for its frequent commands (DS-75). */
export const commandUses = {
  read(accountId: string): Record<string, number> {
    const value = read(`tonaris:command-uses:${accountId}`);
    const record = typeof value === "object" && value !== null ? value : {};
    return Object.fromEntries(
      Object.entries(record).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  },
  add(accountId: string, id: string): void {
    const uses = commandUses.read(accountId);
    write(`tonaris:command-uses:${accountId}`, { ...uses, [id]: (uses[id] ?? 0) + 1 });
  },
};
