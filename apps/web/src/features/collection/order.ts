// Album order and year until sorting exists (TON-35): DS-44's first-time default for lists and Unsorted,
// chronological ascending by FR-05.5's rule. A live album with a recording year sorts by its start; every other
// album by its original year, which is also FR-05.6's fallback for a live album without one. Unknown years come
// last, and ties go by title, then ID, so the order never shifts between renders. DS-24's `rec.` prefix and
// fallback marker come with TON-35.

import { searchKey, type Album } from "@tonaris/domain";

type Chronology = Pick<
  Album,
  "isLive" | "originalYear" | "recordingYearStart" | "recordingYearEnd"
>;

/** The year an album sorts by (FR-05.5, FR-05.6); null when unknown. */
export function sortYear(album: Chronology): number | null {
  if (album.isLive === true && album.recordingYearStart !== null) return album.recordingYearStart;
  return album.originalYear;
}

/** The albums in chronological order, earliest first, unknown years last (DS-44). */
export function chronological<T extends Chronology & Pick<Album, "id" | "title">>(
  albums: readonly T[],
): T[] {
  return albums
    .map((album) => ({ album, year: sortYear(album), title: searchKey(album.title) }))
    .toSorted(
      (a, b) =>
        (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY) ||
        (a.title < b.title ? -1 : a.title > b.title ? 1 : 0) ||
        (a.album.id < b.album.id ? -1 : a.album.id > b.album.id ? 1 : 0),
    )
    .map(({ album }) => album);
}

/** The year shown in a row or card: "1986", a live range "1978–1982", or "—" when unknown. */
export function yearLabel(album: Chronology): string {
  if (album.isLive === true && album.recordingYearStart !== null) {
    const end = album.recordingYearEnd;
    return end !== null && end !== album.recordingYearStart
      ? `${album.recordingYearStart}–${end}`
      : String(album.recordingYearStart);
  }
  return album.originalYear === null ? "—" : String(album.originalYear);
}
