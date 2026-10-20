// Albums as clients hold and edit them (TS-11, TS-24), and the rules every save checks (FR-02.6). The sync
// prototype (TON-20) carries the core metadata; links, artwork, provenance, memberships and Trash join in M2–M5.

import { failure, type Failure } from "./outcomes";
import { z } from "./zod";

/** Null means Unclassified (TS-45). */
export const releaseTypes = ["album", "ep", "compilation"] as const;

const year = z.int().min(1).max(9999);

/** The fields a person edits; each is one CAS unit (TS-21). */
export const albumFieldsSchema = z.object({
  title: z.string(),
  artistCredit: z.string(),
  releaseType: z.enum(releaseTypes).nullable(),
  isLive: z.boolean().nullable(),
  originalYear: year.nullable(),
  recordingYearStart: year.nullable(),
  recordingYearEnd: year.nullable(),
});
export type AlbumFields = z.infer<typeof albumFieldsSchema>;
export type AlbumField = keyof AlbumFields;
export const albumFields: readonly AlbumField[] = albumFieldsSchema.keyof().options;

export const albumSchema = albumFieldsSchema
  .extend({ id: z.uuid({ version: "v7" }) })
  .meta({ description: "An album record (FR-01.6)." });
export type Album = z.infer<typeof albumSchema>;

/**
 * Why `album` can't be saved, if it can't (FR-02.6): the title, the artist and the applicable year are
 * required — the original year, or for a live album its recording year — and a recording period runs forwards.
 */
export function albumProblem(album: AlbumFields): Failure | undefined {
  const missing = [
    album.title.trim() === "" && "title",
    album.artistCredit.trim() === "" && "artistCredit",
    album.originalYear === null &&
      !(album.isLive === true && album.recordingYearStart !== null) &&
      "originalYear",
  ].filter((field) => field !== false);
  if (missing.length > 0) {
    return failure(
      "required_missing",
      "An album needs a title, an artist and a year.",
      missing.map((path) => ({ path, message: "Required" })),
    );
  }
  if (
    album.recordingYearStart !== null &&
    album.recordingYearEnd !== null &&
    album.recordingYearEnd < album.recordingYearStart
  ) {
    return failure("validation_failed", "The recording period ends before it starts.", [
      { path: "recordingYearEnd", message: "Must not be before the start year" },
    ]);
  }
  return undefined;
}
