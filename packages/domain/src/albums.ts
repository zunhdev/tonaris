// Albums as clients hold and edit them (TS-11, TS-24), and the rules every save checks (FR-02.6). The sync
// prototype (TON-20) carries the core metadata; the artwork URL joined in TON-48 (FR-03.4), and links, provenance,
// memberships and Trash have their own records.

import { maxLinkLength } from "./limits";
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
  artworkUrl: z.string().max(maxLinkLength).nullable().meta({
    description:
      "The artwork's https URL, from the Cover Art Archive or the person (FR-03.4). Clients show it through the API's image proxy, never directly (TS-103).",
  }),
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
  if (album.artworkUrl !== null && !isArtworkUrl(album.artworkUrl)) {
    return failure("validation_failed", artworkUrlRefusal, [
      { path: "artworkUrl", message: "Not an https link" },
    ]);
  }
  return undefined;
}

/** Why an artwork URL is refused (FR-03.4). */
export const artworkUrlRefusal =
  "Give the artwork as an https link, such as https://example.com/cover.jpg.";

/**
 * Whether `url` can be an album's artwork (FR-03.4, Q-05): an https URL on its default port, without credentials. The
 * image proxy checks the rest, the host and what it answers, every time it fetches (TS-103).
 */
export function isArtworkUrl(url: string): boolean {
  if (url.length > maxLinkLength) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    parsed.hostname !== ""
  );
}

/**
 * Where an album's artwork is shown from (TS-103): the API's image proxy, `/img/{signature}/{base64url(url)}`, with the
 * signature the server sent with the album. Clients add the API's origin.
 */
export function artworkPath(url: string, signature: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(url)) binary += String.fromCodePoint(byte);
  const encoded = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `/img/${signature}/${encoded}`;
}
