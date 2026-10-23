// The rules of an album's inline cells (DS-45, FR-03.1, FR-02.6): what each cell's editor starts with, and what a
// typed value saves, or why it can't. The year cell edits the year it shows (DS-24): the original year, a live
// album's recording year or range, or, for a live album without one, the release year it falls back to. The
// domain's `albumProblem` has the last word, so nothing the server would refuse is sent (X-05). Pure, so the rules
// are tested without a DOM.

import { albumFields, albumProblem, type Album, type AlbumFields } from "@tonaris/domain";

export type AlbumCell = "title" | "artistCredit" | "year";

/** What an inline edit does: save these fields, refuse with a reason, or nothing, for an unchanged value. */
export type AlbumEdit =
  | { kind: "save"; values: Partial<AlbumFields> }
  | { kind: "refuse"; reason: string }
  | { kind: "unchanged" };

const formatRefusal = "Enter the year as four digits, such as 1986.";

/** Whether the year cell shows, and so edits, a live album's recording year. */
const editsRecording = (album: Album) => album.isLive === true && album.recordingYearStart !== null;

/** What the cell's editor starts with: the value as the cell shows it, without `rec.` or the fallback marker. */
export function cellText(album: Album, cell: AlbumCell): string {
  if (cell === "title") return album.title;
  if (cell === "artistCredit") return album.artistCredit;
  if (editsRecording(album)) {
    const { recordingYearStart: start, recordingYearEnd: end } = album;
    return end !== null && end !== start ? `${start}–${end}` : String(start);
  }
  return album.originalYear === null ? "" : String(album.originalYear);
}

/** A year or range as typed: "1986", or "1978–1982" with any dash; undefined if it isn't one. */
function parseYears(text: string): { start: number; end: number | null } | undefined {
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
  } else if (editsRecording(album)) {
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
