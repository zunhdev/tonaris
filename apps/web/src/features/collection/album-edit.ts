// The rules of an album's editors (DS-45, DS-46, FR-03.1, FR-02.6): what each one starts with, and what a typed
// value or a choice saves, or why it can't. A row's year cell edits the year it shows (DS-24): the original year, a
// live album's recording year or range, or, for a live album without one, the release year it falls back to. The
// inspector edits the original year and the recording years each on their own. The domain's `albumProblem` has the
// last word, so nothing the server would refuse is sent (X-05). Pure, so the rules are tested without a DOM.

import {
  albumFields,
  albumProblem,
  groupNames,
  groupOf,
  releaseTypes,
  type Album,
  type AlbumFields,
} from "@tonaris/domain";

/** A text editor: a row's cells (title, artist, year) and the inspector's years. */
export type AlbumCell = "title" | "artistCredit" | "year" | "originalYear" | "recording";

/** Each editor's name, for its label: "Title", or "Title of 'Nightfall'" where the album isn't on show. */
export const cellNames: Record<AlbumCell, string> = {
  title: "Title",
  artistCredit: "Artist",
  year: "Year",
  originalYear: "Original release year",
  recording: "Recording year or range",
};

/** The release type's choices (DS-46, DS-47): the domain's types, by their groups' names, then Unknown, for none. */
export const releaseTypeOptions: readonly {
  value: NonNullable<Album["releaseType"]> | "unknown";
  label: string;
}[] = [
  ...releaseTypes.map((value) => ({ value, label: groupNames[value] })),
  { value: "unknown", label: "Unknown" },
];

/** The release type in words (DS-19): its group's name, live first as the groups have it (FR-05.9), or — for none. */
export function typeName(album: Pick<Album, "releaseType" | "isLive">): string {
  const group = groupOf(album);
  return group === "unclassified" ? "—" : groupNames[group];
}

/** What an edit does: save these fields, refuse with a reason, or nothing, for an unchanged value. */
export type AlbumEdit =
  | { kind: "save"; values: Partial<AlbumFields> }
  | { kind: "refuse"; reason: string }
  | { kind: "unchanged" };

export const formatRefusal = "Enter the year as four digits, such as 1986.";

/** Whether a row's year cell shows, and so edits, a live album's recording year. */
const editsRecording = (album: Album) => album.isLive === true && album.recordingYearStart !== null;

/** Whether `cell` edits the recording years. */
const isRecording = (album: Album, cell: AlbumCell) =>
  cell === "recording" || (cell === "year" && editsRecording(album));

/** What the editor starts with: the value as shown, without `rec.` or the fallback marker. */
export function cellText(album: Album, cell: AlbumCell): string {
  if (cell === "title") return album.title;
  if (cell === "artistCredit") return album.artistCredit;
  if (isRecording(album, cell)) {
    const { recordingYearStart: start, recordingYearEnd: end } = album;
    if (start === null) return "";
    return end !== null && end !== start ? `${start}–${end}` : String(start);
  }
  return album.originalYear === null ? "" : String(album.originalYear);
}

/** A year or range as typed: "1986", or "1978–1982" with any dash; undefined if it isn't one. */
export function parseYears(text: string): { start: number; end: number | null } | undefined {
  const match = /^(\d{1,4})(?:\s*[-‐‑‒–—]\s*(\d{1,4}))?$/u.exec(text);
  if (!match?.[1]) return undefined;
  const start = Number(match[1]);
  const end = match[2] === undefined ? null : Number(match[2]);
  if (start < 1 || (end !== null && end < 1)) return undefined;
  return { start, end };
}

/** What typing `text` into `album`'s `cell` saves, or why it can't. */
export function albumEdit(album: Album, cell: AlbumCell, text: string): AlbumEdit {
  const typed = text.trim();
  let values: Partial<AlbumFields>;
  if (cell === "title" || cell === "artistCredit") {
    if (typed === "") {
      return {
        kind: "refuse",
        reason: cell === "title" ? "Give the album a title." : "Give the album an artist.",
      };
    }
    values = { [cell]: typed };
  } else if (isRecording(album, cell)) {
    if (typed === "") values = { recordingYearStart: null, recordingYearEnd: null };
    else {
      const years = parseYears(typed);
      if (!years) return { kind: "refuse", reason: formatRefusal };
      values = {
        recordingYearStart: years.start,
        recordingYearEnd: years.end === null || years.end === years.start ? years.start : years.end,
      };
    }
  } else if (typed === "") values = { originalYear: null };
  else {
    const years = parseYears(typed);
    if (!years || years.end !== null) return { kind: "refuse", reason: formatRefusal };
    values = { originalYear: years.start };
  }
  return checked(album, values);
}

/**
 * What choosing a release type or Live saves, or why it can't: switching Live off for an album that has only a
 * recording year would leave it without its applicable year (FR-02.6).
 */
export function albumChoice(
  album: Album,
  values: Partial<Pick<AlbumFields, "releaseType" | "isLive">>,
): AlbumEdit {
  return checked(album, values);
}

/** `values` as the changes they make to `album`, checked by the domain's album rules. */
function checked(album: Album, values: Partial<AlbumFields>): AlbumEdit {
  const changed: Partial<AlbumFields> = {};
  for (const field of albumFields) {
    if (values[field] !== undefined && values[field] !== album[field]) {
      Object.assign(changed, { [field]: values[field] });
    }
  }
  if (Object.keys(changed).length === 0) return { kind: "unchanged" };
  const problem = albumProblem({ ...album, ...changed });
  if (problem) {
    const missingYear = problem.problem.errors?.some((error) => error.path === "originalYear");
    return {
      kind: "refuse",
      reason: missingYear ? "Give the album a year." : (problem.problem.detail ?? formatRefusal),
    };
  }
  return { kind: "save", values: changed };
}
