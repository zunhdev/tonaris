// The order and grouping of a view's contents (FR-05.1, FR-05.5–FR-05.9, DS-24, DS-42–DS-44): albums by year, name
// or manual order, folders and lists by name, creation date or manual order, and albums grouped by release type in
// DS-43's fixed sequence. Grouping splits the one sorted sequence, so the order within each group is the combined
// order (FR-05.8). Manual order is the person's arrangement (TS-16): arranged items by their fractional-index keys,
// then the rest in DS-44's fallback order, which the view supplies for albums. A move is planned here as the keys
// it writes, by `planMove`, which MCP shares (packages/domain). Every sort is total, ties going by title or name, then ID, so the order never shifts between renders.
// Pure, so the rules are tested without a DOM.

import {
  planMove,
  searchKey,
  type Place,
  type Album,
  type Container,
  type FolderSortMode,
  type ListSortMode,
  type SortDirection,
} from "@tonaris/domain";

type Chronology = Pick<
  Album,
  "isLive" | "originalYear" | "recordingYearStart" | "recordingYearEnd"
>;

/** The year an album sorts by (FR-05.5, FR-05.6); null when unknown. */
export function sortYear(album: Chronology): number | null {
  if (album.isLive === true && album.recordingYearStart !== null) return album.recordingYearStart;
  return album.originalYear;
}

export { planMove, type Place };

export type Sort<Mode> = { mode: Mode; dir: SortDirection };

/** One view's keys, by item ID (TS-16). */
export type Keys = ReadonlyMap<string, string>;

const noKeys: Keys = new Map();

/** Compares bytewise, as fractional-index keys and IDs must be. Keys and IDs are ASCII, so code units are bytes. */
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Items in manual order (TS-16): those with keys by key, ties by ID, then the rest in the order given, which is
 * the view's fallback (DS-44).
 */
export function arranged<T>(items: readonly T[], keys: Keys, idOf: (item: T) => string): T[] {
  const keyed: { item: T; id: string; key: string }[] = [];
  const rest: T[] = [];
  for (const item of items) {
    const id = idOf(item);
    const key = keys.get(id);
    if (key === undefined) rest.push(item);
    else keyed.push({ item, id, key });
  }
  keyed.sort((a, b) => byKey(a.key, b.key) || byKey(a.id, b.id));
  return [...keyed.map(({ item }) => item), ...rest];
}

/** A keyboard move (DS-49): by one, or to the top or bottom. */
export type Direction = "up" | "down" | "top" | "bottom";

/**
 * Where moving `id` `to` puts it among `group`, the items it moves among in their order (a group's, when grouped),
 * and its position there from 1; nothing when it is already at that end.
 */
export function placeIn(
  group: readonly string[],
  id: string,
  to: Direction,
): { place: Place; position: number } | undefined {
  const index = group.indexOf(id);
  const last = group.length - 1;
  const first = group[0];
  const end = group[last];
  if (index === -1 || first === undefined || end === undefined) return undefined;
  if (to === "up" || to === "top") {
    const before = to === "up" ? group[index - 1] : first;
    return index === 0 || before === undefined
      ? undefined
      : { place: { before }, position: to === "up" ? index : 1 };
  }
  const after = to === "down" ? group[index + 1] : end;
  return index === last || after === undefined
    ? undefined
    : { place: { after }, position: to === "down" ? index + 2 : group.length };
}

/**
 * The albums in the view's sort. `albums` come in the view's fallback order; Manual arranges them by `keys`. Year
 * puts unknown years last in both directions; ties go by title, ignoring case and accents, then by ID, ascending
 * either way. Name sorts by title, ties by artist, then ID.
 */
export function sortAlbums<T extends Chronology & Pick<Album, "id" | "title" | "artistCredit">>(
  albums: readonly T[],
  { mode, dir }: Sort<ListSortMode>,
  keys: Keys = noKeys,
): T[] {
  if (mode === "manual") return arranged(albums, keys, (album) => album.id);
  const sign = dir === "asc" ? 1 : -1;
  const keyed = albums.map((album) => ({
    album,
    year: sortYear(album),
    title: searchKey(album.title),
    artist: mode === "name" ? searchKey(album.artistCredit) : "",
  }));
  return keyed
    .toSorted((a, b) => {
      let primary = 0;
      if (mode === "year") {
        if (a.year === null || b.year === null)
          primary = (a.year === null ? 1 : 0) - (b.year === null ? 1 : 0);
        else primary = sign * (a.year - b.year);
      } else primary = sign * byKey(a.title, b.title);
      return (
        primary ||
        (mode === "year" ? byKey(a.title, b.title) : byKey(a.artist, b.artist)) ||
        byKey(a.album.id, b.album.id)
      );
    })
    .map(({ album }) => album);
}

/**
 * Folders and lists in the view's sort (DS-42). Name and Created put folders first, then lists, each by name,
 * ignoring case and accents, or by when it was made, which its UUIDv7 ID holds (TS-10). Manual is one mixed
 * sequence: arranged by `keys`, the rest in creation order (DS-44).
 */
export function sortContainers<T extends Pick<Container, "id" | "kind" | "name">>(
  containers: readonly T[],
  { mode, dir }: Sort<FolderSortMode>,
  keys: Keys = noKeys,
): T[] {
  const byCreation = (a: T, b: T) => byKey(a.id, b.id);
  if (mode === "manual") {
    return arranged(containers.toSorted(byCreation), keys, (container) => container.id);
  }
  const sign = dir === "asc" ? 1 : -1;
  const keyed = containers.map((container) => ({ container, name: searchKey(container.name) }));
  return keyed
    .toSorted(
      (a, b) =>
        (a.container.kind === b.container.kind ? 0 : a.container.kind === "folder" ? -1 : 1) ||
        (mode === "name"
          ? sign * byKey(a.name, b.name) || byCreation(a.container, b.container)
          : sign * byCreation(a.container, b.container)),
    )
    .map(({ container }) => container);
}

/** DS-43's group sequence: core studio work first, unknowns last. Everyone sees the same (FR-05.7). */
export const releaseGroups = ["album", "ep", "live", "compilation", "unclassified"] as const;
export type ReleaseGroup = (typeof releaseGroups)[number];

export const groupNames: Record<ReleaseGroup, string> = {
  album: "Album",
  ep: "EP",
  live: "Live",
  compilation: "Compilation",
  unclassified: "Unclassified",
};

/**
 * The one group an album belongs to (FR-05.9): Live before any type, then its type. Singles and unknown types are
 * Unclassified, which TS-45 stores as no type.
 */
export function groupOf(album: Pick<Album, "isLive" | "releaseType">): ReleaseGroup {
  if (album.isLive === true) return "live";
  return album.releaseType ?? "unclassified";
}

/** A run of a view's albums: one group of them, or all of them when combined (`group` undefined). */
export type Section<T> = { group: ReleaseGroup | undefined; albums: T[] };

/** The sorted albums as the view shows them: one section combined, or the non-empty groups in sequence. */
export function sections<T extends Pick<Album, "isLive" | "releaseType">>(
  sorted: readonly T[],
  grouped: boolean,
): Section<T>[] {
  if (!grouped) return [{ group: undefined, albums: [...sorted] }];
  const byGroup = new Map<ReleaseGroup, T[]>();
  for (const album of sorted) {
    const group = groupOf(album);
    const albums = byGroup.get(group);
    if (albums) albums.push(album);
    else byGroup.set(group, [album]);
  }
  return releaseGroups.flatMap((group) => {
    const albums = byGroup.get(group);
    return albums ? [{ group, albums }] : [];
  });
}

/**
 * How an album's year shows (DS-24): the year or a live recording range, "1978–1982", or "—" when unknown.
 * `recorded` marks a recording year, shown with `rec.`; `fallback` a live album sorted by its release year because
 * its recording year is unknown (FR-05.6).
 */
export function chronology(album: Chronology): {
  year: string;
  recorded: boolean;
  fallback: boolean;
} {
  if (album.isLive === true && album.recordingYearStart !== null) {
    const end = album.recordingYearEnd;
    const year =
      end !== null && end !== album.recordingYearStart
        ? `${album.recordingYearStart}–${end}`
        : String(album.recordingYearStart);
    return { year, recorded: true, fallback: false };
  }
  if (album.originalYear === null) return { year: "—", recorded: false, fallback: false };
  return { year: String(album.originalYear), recorded: false, fallback: album.isLive === true };
}
