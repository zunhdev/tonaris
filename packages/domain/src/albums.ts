// Albums as clients hold and edit them (TS-11, TS-24), and the rules every save checks (FR-02.6). The sync
// prototype (TON-20) carries the core metadata; the artwork URL joined in TON-48 (FR-03.4), edited with its own
// mutation, and links, provenance, memberships and Trash have their own records.

import type { CollectionStore } from "./commands";
import { maxAlbumTextLength, maxAlbums, maxLinkLength } from "./limits";
import { failure, type Failure } from "./outcomes";
import { z } from "./zod";

/** Null means Unclassified (TS-45). */
export const releaseTypes = ["album", "ep", "compilation"] as const;

const year = z.int().min(1).max(9999);

export const artworkUrlSchema = z.string().max(maxLinkLength).nullable().meta({
  description:
    "The artwork's https URL, from the Cover Art Archive or the person (FR-03.4). Clients show it through the API's image proxy, never directly (TS-103).",
});

/** The fields a person edits with `album.update`; each is one CAS unit (TS-21). */
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

/**
 * `album.create`'s arguments: the album's fields and the ID the client chose (TS-10). Its artwork is set with
 * `album.setArtwork`, so this request keeps the shape it had before artwork (TS-09).
 */
export const albumCreateArgsSchema = albumFieldsSchema
  .extend({ id: z.uuid({ version: "v7" }) })
  // The description it had as the record's schema, so the request's contract stays the same (TS-09).
  .meta({ description: "An album record (FR-01.6)." });
export type AlbumCreateArgs = z.infer<typeof albumCreateArgsSchema>;

/** An album record as clients hold it: its fields, ID and artwork URL (FR-01.6, FR-03.4). */
export const albumSchema = albumCreateArgsSchema
  .extend({ artworkUrl: artworkUrlSchema })
  .meta({ description: "An album record (FR-01.6)." });
export type Album = z.infer<typeof albumSchema>;

/**
 * Why `album` can't be saved, if it can't (FR-02.6): the title, the artist and the applicable year are
 * required — the original year, or for a live album its recording year — the title and artist fit TS-18's limit, and
 * a recording period runs forwards.
 */
export function albumProblem(
  album: AlbumFields & { artworkUrl?: string | null },
): Failure | undefined {
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
  const tooLong = (["title", "artistCredit"] as const).filter(
    // Code points rather than graphemes: the limit bounds stored text (TS-18).
    // oxlint-disable-next-line no-misused-spread
    (field) => [...album[field]].length > maxAlbumTextLength,
  );
  if (tooLong.length > 0) {
    const most = maxAlbumTextLength.toLocaleString("en");
    return failure(
      "validation_failed",
      `Titles and artist credits can be at most ${most} characters.`,
      tooLong.map((path) => ({ path, message: `At most ${most} characters` })),
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
  if (album.artworkUrl != null && !isArtworkUrl(album.artworkUrl)) {
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

/** A cover Find artwork offers (TON-112): an album on MusicBrainz with its Cover Art Archive front, signed to show. */
export const coverSchema = z
  .object({
    releaseGroupId: z.uuid().meta({ description: "The album's MusicBrainz release group." }),
    title: z.string(),
    artistCredit: z.string(),
    year: z
      .number()
      .int()
      .nullable()
      .meta({ description: "Its first release's year, when known." }),
    type: z
      .string()
      .nullable()
      .meta({ description: "MusicBrainz's primary type, such as Album or EP, when it has one." }),
    artworkUrl: z.string().meta({
      description: "The archive's stable `front-500` address: the URL to save as the artwork.",
    }),
    artworkSignature: z.string().meta({
      description: "Shows the cover through the image proxy, as album records' do (TS-103).",
    }),
  })
  .meta({ description: "An album's cover to choose." });
export type Cover = z.infer<typeof coverSchema>;

export const coversSchema = z
  .object({ covers: z.array(coverSchema) })
  .meta({ description: "Covers on the Cover Art Archive, in MusicBrainz's order." });

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

/**
 * The refusal of a new album at the limit (FR-15.3, DS-98), with these words in the app too: only the new record is
 * refused, and everything else keeps working.
 */
export function albumCapacityProblem(): Failure {
  return failure(
    "capacity_exceeded",
    `You've reached ${maxAlbums.toLocaleString("en")} albums (including Trash). Permanently delete albums from Trash or remove albums to add more.`,
  );
}

/** Whether the owner may save one more album: there is a slot left, Trash counting (FR-15.2). */
export async function hasAlbumSlot(store: CollectionStore, ownerId: string): Promise<boolean> {
  return (await store.countAlbums(ownerId)) < maxAlbums;
}
