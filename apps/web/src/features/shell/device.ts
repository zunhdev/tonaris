// What the workspace remembers on this device, not synced (DS-27, DS-30, DS-32): which folders are expanded, the
// sidebar's width and whether it is hidden, and the last collection view visited. Kept in localStorage, which can
// be missing or refuse writes (private modes, blocked storage): then nothing is remembered, and nothing fails.

const read = (key: string): unknown => {
  try {
    const text = globalThis.localStorage?.getItem(key);
    return text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    return undefined;
  }
};

const write = (key: string, value: unknown): void => {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; the workspace works the same.
  }
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

export function clampWidth(width: number): number {
  return Math.round(Math.min(sidebarWidths.max, Math.max(sidebarWidths.min, width)));
}

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

export type Layout = "rows" | "grid";

/** How each list, and Unsorted, shows its albums (DS-40), per account, until TON-35 syncs it (FR-11.8). */
export const viewLayouts = {
  read(accountId: string, view: string): Layout {
    const value = read(`tonaris:layouts:${accountId}`);
    const stored = typeof value === "object" && value !== null ? Object.entries(value) : [];
    return stored.some(([key, layout]) => key === view && layout === "grid") ? "grid" : "rows";
  },
  write(accountId: string, view: string, layout: Layout): void {
    const value = read(`tonaris:layouts:${accountId}`);
    const stored =
      typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {};
    write(`tonaris:layouts:${accountId}`, { ...stored, [view]: layout });
  },
};
