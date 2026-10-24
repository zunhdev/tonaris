// Enrichment's rule (TS-42, FR-03.3): what an album takes from what MusicBrainz says about it. Only missing
// values are filled; populated ones, a person's or an earlier source's, are kept, even where the source disagrees.
// The album's identity follows MusicBrainz's merges and deletions (TS-44). Asking is `@tonaris/providers`' job, and
// writing the plan `@tonaris/db`'s, on the album as it is under the owner's write lock: this only decides.

import { albumFields, type AlbumFields } from "./albums";

/** Where a saved value came from (TS-15). Values from Spotify, Qobuz or Tidal are never saved (TS-41). */
export const provenanceSources = [
  "user",
  "musicbrainz",
  "coverartarchive",
  "itunes-lookup",
] as const;
export type ProvenanceSource = (typeof provenanceSources)[number];

/** The values enrichment fills: those a person edits, and the artwork (FR-03.4). */
export type EnrichableFields = AlbumFields & { artworkUrl: string | null };
export type EnrichableField = keyof EnrichableFields;
export const enrichableFields: readonly EnrichableField[] = [...albumFields, "artworkUrl"];

/** An album as enrichment sees it: its values, and the MusicBrainz release group it is, if it is identified. */
export type EnrichableAlbum = EnrichableFields & { releaseGroupId: string | null };

/** A value and where it came from: its source, and the MBID it was read from. */
export type Sourced<T> = { value: T; source: ProvenanceSource; ref: string };

/** What a source has for each field; a field it has nothing for is absent. */
export type SourcedValues = {
  [F in EnrichableField]?: Sourced<NonNullable<EnrichableFields[F]>>;
};

/** What MusicBrainz says about the release group asked about. */
export type AlbumFacts =
  | {
      status: "found";
      askedId: string;
      /** The id MusicBrainz answered under: another one when it has merged the asked one into it. */
      releaseGroupId: string;
      values: SourcedValues;
    }
  /** MusicBrainz answered 404: the release group no longer exists. */
  | { status: "deleted"; askedId: string };

/** One `album_provenance` row (TS-11). */
export type ProvenanceEntry = {
  field: EnrichableField;
  source: ProvenanceSource;
  sourceRef: string | null;
  retrievedAt: Date | null;
};

/**
 * What enrichment does to the album's identity: nothing, sets it on a new album, follows a merge, clears it for a
 * deleted release group, or nothing at all because the album is another release group.
 */
export type Identity = "unchanged" | "set" | "merged" | "deleted" | "elsewhere";

export type EnrichmentPlan = {
  identity: Identity;
  /** The release group to store, when it changes; null clears it. */
  releaseGroupId?: string | null;
  /** The values filled, and their provenance. */
  values: Partial<EnrichableFields>;
  provenance: ProvenanceEntry[];
};

/** The album a capture starts from: every value missing, and no identity yet. */
export const blankAlbum: EnrichableAlbum = {
  title: "",
  artistCredit: "",
  releaseType: null,
  isLive: null,
  originalYear: null,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  releaseGroupId: null,
};

/** A value enrichment may fill: unknown, or a blank title or artist. */
const isMissing = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "");

const recordingFields = new Set<EnrichableField>(["recordingYearStart", "recordingYearEnd"]);

/**
 * What `album` takes from `facts` (TS-42, TS-44). Only missing values are filled. The recording range is one value:
 * filled only when both its years are missing, and only for an album that is live once filled, so a person's "not
 * live" keeps it free of recording years (TS-46). An album identified as another release group takes nothing.
 */
export function planEnrichment(
  album: EnrichableAlbum,
  facts: AlbumFacts,
  now: Date = new Date(),
): EnrichmentPlan {
  const saved = album.releaseGroupId;
  const answered = facts.status === "found" ? facts.releaseGroupId : undefined;
  if (saved !== null && saved !== facts.askedId && saved !== answered) {
    return { identity: "elsewhere", values: {}, provenance: [] };
  }
  if (facts.status === "deleted") {
    return saved === null
      ? { identity: "unchanged", values: {}, provenance: [] }
      : { identity: "deleted", releaseGroupId: null, values: {}, provenance: [] };
  }

  const sourced = facts.values;
  const values: Partial<EnrichableFields> = {};
  const provenance: ProvenanceEntry[] = [];
  function fill(field: EnrichableField): void {
    const found = sourced[field];
    if (!found) return;
    // `SourcedValues` holds each field's own type, so the value fits its field.
    Object.assign(values, { [field]: found.value });
    provenance.push({ field, source: found.source, sourceRef: found.ref, retrievedAt: now });
  }
  for (const field of enrichableFields) {
    if (!recordingFields.has(field) && isMissing(album[field])) fill(field);
  }
  const live = values.isLive ?? album.isLive;
  if (
    live === true &&
    sourced.recordingYearStart &&
    sourced.recordingYearEnd &&
    isMissing(album.recordingYearStart) &&
    isMissing(album.recordingYearEnd)
  ) {
    fill("recordingYearStart");
    fill("recordingYearEnd");
  }

  const identity: Identity =
    saved === facts.releaseGroupId ? "unchanged" : saved === null ? "set" : "merged";
  return {
    identity,
    ...(identity === "unchanged" ? {} : { releaseGroupId: facts.releaseGroupId }),
    values,
    provenance,
  };
}
