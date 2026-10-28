// The manual entry form's rules (DS-47, FR-02.4, FR-02.6): its fields as typed, what is missing or malformed, and the
// album they make. Title, artist and the applicable year are required: the original release year, or for a live
// album the recording year or the release year (FR-02.6). Nothing is invented: a field left empty stays empty. The
// domain's `albumProblem` checks the built album last. A link per service is optional, and checked as the server
// will read it (FR-06.3, TS-40). Pure, so the rules are tested without a DOM.

import {
  albumProblem,
  artworkUrlRefusal,
  isArtworkUrl,
  streamingServices,
  uuidv7,
  type Album,
  type FieldValueData,
  type ServiceLink,
  type StreamingService,
} from "@tonaris/domain";

import { cellText, formatRefusal, parseYears } from "./album-edit";
import { checkLink } from "./link-check";

/** The form as typed. Years are text until saved. */
export type AlbumForm = {
  title: string;
  artistCredit: string;
  releaseType: Album["releaseType"];
  isLive: boolean;
  originalYear: string;
  /** The recording year or range; only used for a live album. */
  recording: string;
  /** The artwork's https URL as typed; empty for none (FR-03.4). */
  artworkUrl: string;
  /** Each service's link as typed; empty for none. */
  links: Record<StreamingService, string>;
  /** The custom fields applied, with their values, already checked by their editors (FR-03.7). */
  fieldValues: { fieldId: string; value: FieldValueData }[];
  /** The destination list; null for none, so the album goes to Unsorted. */
  listId: string | null;
};

export type FormField =
  | "title"
  | "artistCredit"
  | "originalYear"
  | "recording"
  | "artworkUrl"
  | StreamingService;

const noLinks = (): Record<StreamingService, string> => ({
  spotify: "",
  "apple-music": "",
  qobuz: "",
  tidal: "",
});

/** An empty form, going to `listId` if given. */
export function emptyForm(listId: string | null): AlbumForm {
  return {
    title: "",
    artistCredit: "",
    releaseType: null,
    isLive: false,
    originalYear: "",
    recording: "",
    artworkUrl: "",
    links: noLinks(),
    fieldValues: [],
    listId,
  };
}

/** A form holding an album as it was entered, as Edit on a failed save reopens it (AC-08). */
export function formOf(album: Album, listId: string | null): AlbumForm {
  return {
    title: album.title,
    artistCredit: album.artistCredit,
    releaseType: album.releaseType,
    isLive: album.isLive === true,
    originalYear: cellText(album, "originalYear"),
    recording: cellText(album, "recording"),
    artworkUrl: album.artworkUrl ?? "",
    links: noLinks(),
    fieldValues: [],
    listId,
  };
}

/** Whether anything was typed or chosen, beyond the destination. */
export function isFormDirty(form: AlbumForm): boolean {
  const empty = emptyForm(form.listId);
  return (
    form.title !== empty.title ||
    form.artistCredit !== empty.artistCredit ||
    form.releaseType !== empty.releaseType ||
    form.isLive !== empty.isLive ||
    form.originalYear !== empty.originalYear ||
    form.recording !== empty.recording ||
    form.artworkUrl !== empty.artworkUrl ||
    streamingServices.some((service) => form.links[service] !== "") ||
    form.fieldValues.length > 0
  );
}

/** What is wrong with each field, by field; empty when the form can be saved. */
export function formProblems(form: AlbumForm): Partial<Record<FormField, string>> {
  const problems: Partial<Record<FormField, string>> = {};
  if (form.title.trim() === "") problems.title = "Give the album a title.";
  if (form.artistCredit.trim() === "") problems.artistCredit = "Give the album an artist.";

  const original = form.originalYear.trim();
  const originalYears = original === "" ? undefined : parseYears(original);
  if (original !== "" && (!originalYears || originalYears.end !== null)) {
    problems.originalYear = formatRefusal;
  }
  const recording = form.isLive ? form.recording.trim() : "";
  const recordingYears = recording === "" ? undefined : parseYears(recording);
  if (recording !== "" && !recordingYears) problems.recording = formatRefusal;
  else if (recordingYears?.end != null && recordingYears.end < recordingYears.start) {
    problems.recording = "The recording period ends before it starts.";
  }

  // FR-02.6: the original year, or for a live album, its recording year instead.
  if (original === "" && recording === "") {
    problems.originalYear = form.isLive
      ? "Give the album its recording year or its release year."
      : "Give the album its original release year.";
  }
  const artwork = form.artworkUrl.trim();
  if (artwork !== "" && !isArtworkUrl(artwork)) problems.artworkUrl = artworkUrlRefusal;
  for (const service of streamingServices) {
    const reason = checkLink(service, form.links[service]);
    if (reason !== undefined) problems[service] = reason;
  }
  return problems;
}

/** The links the form gives the album `albumId`, as typed: the server reads them (TS-40). */
export function linksOfForm(form: AlbumForm, albumId: string): ServiceLink[] {
  return streamingServices.flatMap((service) => {
    const url = form.links[service].trim();
    return url === "" ? [] : [{ albumId, service, url }];
  });
}

/** The album the form makes, with a new ID; undefined while it has problems. */
export function albumOfForm(form: AlbumForm): Album | undefined {
  if (Object.keys(formProblems(form)).length > 0) return undefined;
  const original = parseYears(form.originalYear.trim());
  const recording = form.isLive ? parseYears(form.recording.trim()) : undefined;
  const album: Album = {
    id: uuidv7(),
    title: form.title.trim(),
    artistCredit: form.artistCredit.trim(),
    releaseType: form.releaseType,
    isLive: form.isLive,
    originalYear: original?.start ?? null,
    recordingYearStart: recording?.start ?? null,
    recordingYearEnd: recording ? (recording.end ?? recording.start) : null,
    artworkUrl: form.artworkUrl.trim() || null,
  };
  return albumProblem(album) ? undefined : album;
}
