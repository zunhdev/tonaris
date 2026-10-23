// The order and grouping of a view's contents (FR-05.1, FR-05.5–FR-05.9, DS-24, DS-42–DS-44): albums by year, name
// or manual order, folders and lists by name, creation date or manual order, and albums grouped by release type in
// DS-43's fixed sequence. Grouping splits the one sorted sequence, so the order within each group is the combined
// order (FR-05.8). Manual order is the person's arrangement; until TON-36 writes positions, it is DS-44's
// fallbacks, which the view supplies for albums. Every sort is total, ties going by title or name, then ID, so the
// order never shifts between renders. Pure, so the rules are tested without a DOM.

import {
  searchKey,
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

export type Sort<Mode> = { mode: Mode; dir: SortDirection };

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The albums in the view's sort. `albums` come in the view's manual order, which Manual keeps. Year puts unknown
 * years last in both directions; ties go by title, ignoring case and accents, then by ID, ascending either way.
 * Name sorts by title, ties by artist, then ID.
 */
export function sortAlbums<T extends Chronology & Pick<Album, "id" | "title" | "artistCredit">>(
  albums: readonly T[],
  { mode, dir }: Sort<ListSortMode>,
): T[] {
  if (mode === "manual") return [...albums];
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
 * sequence: creation order until TON-36 (DS-44).
 */
export function sortContainers<T extends Pick<Container, "id" | "kind" | "name">>(
  containers: readonly T[],
  { mode, dir }: Sort<FolderSortMode>,
): T[] {
  const byCreation = (a: T, b: T) => byKey(a.id, b.id);
  if (mode === "manual") return containers.toSorted(byCreation);
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
