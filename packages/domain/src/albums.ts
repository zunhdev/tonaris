// Albums as clients hold and edit them (TS-11, TS-24), the rules every save checks (FR-02.6), and the commands that
// create and edit them. The sync prototype (TON-20) carries the core metadata; the artwork URL joined in TON-48
// (FR-03.4), edited with its own mutation, and links, provenance, memberships and Trash have their own records.

import type { CollectionStore } from "./collection-store";
import {
  actingOwner,
  applied,
  baseProblem,
  conflict,
  isFailure,
  nothingChanged,
  staleFields,
} from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import { maxAlbumTextLength, maxAlbums, maxLinkLength } from "./limits";
import { exceedsLength } from "./names";
import { failure, type Failure } from "./outcomes";
import { authorizeWrite } from "./policies";
import { placeAtTop } from "./positions";
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

/** An album as the store keeps it: with its owner, and whether it is in Trash (TS-13). */
export type StoredAlbum = Album & { ownerId: string; trashed: boolean };

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
  const tooLong = (["title", "artistCredit"] as const).filter((field) =>
    exceedsLength(album[field], maxAlbumTextLength),
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

/** The album `id`, in Trash or not, if the principal may change it, or why not (TS-30). */
export async function changeableAlbum(
  id: string,
  { principal, store }: CommandContext,
): Promise<StoredAlbum | Failure> {
  const album = await store.findAlbum(id);
  if (!album) return failure("not_found", "This album doesn't exist.");
  const decision = authorizeWrite(principal, { ownerId: album.ownerId, scope: "collection" });
  if (!decision.allowed) return failure(decision.code, "You can't change this album.");
  return album;
}

/** The album as clients see it, without the owner and Trash state. */
function albumOf(stored: StoredAlbum): Album {
  const { ownerId: _, trashed: __, ...album } = stored;
  return album;
}

/**
 * `album.create`: creates an album with the client's ID (TS-10). If that album already exists for the same owner, as when a
 * create is sent again without its idempotency record, nothing is duplicated (FR-13.5): the same values are
 * already saved, and different ones are a conflict.
 */
export async function createAlbum(
  args: AlbumCreateArgs,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = actingOwner(context, "collection", "You can't add albums here.");
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  const problem = albumProblem(args);
  if (problem) return problem;

  const existing = await store.findAlbum(args.id);
  if (existing) {
    if (existing.ownerId !== ownerId) {
      return failure("validation_failed", "This album ID is already in use.", [
        { path: "args.id", message: "Already in use" },
      ]);
    }
    const conflicts = albumFields
      .filter((field) => existing[field] !== args[field])
      .map((field) => ({ field, current: existing[field], attempted: args[field] }));
    return conflicts.length > 0 ? { status: "conflict", conflicts } : applied();
  }

  // A new record needs a slot; Trash counts (FR-15.2).
  if (!(await hasAlbumSlot(store, ownerId))) return albumCapacityProblem();
  // Its artwork, if any, follows with `album.setArtwork` (TON-48).
  const album: Album = { ...args, artworkUrl: null };
  await store.insertAlbum({ ...album, ownerId });
  // A new album is in no list yet, so it enters Unsorted, at the top (DS-51). Until Unsorted is arranged, its
  // fallback order, newest first, already puts it there.
  const arranged = (await store.firstKey(ownerId, "unsorted")) !== undefined;
  return applied(
    { entity: "album", id: args.id, op: "insert", data: album },
    ...(arranged ? [await placeAtTop(store, ownerId, "unsorted", args.id)] : []),
  );
}

/**
 * `album.setArtwork` (FR-03.4): sets or clears the album's artwork URL if it is still `base.artworkUrl` (TS-21). It
 * must be an https link; the image proxy checks the rest each time it fetches (TS-103). The same URL changes nothing.
 */
export async function setArtwork(
  { id, artworkUrl }: { id: string; artworkUrl: string | null },
  base: { artworkUrl: string | null },
  context: CommandContext,
): Promise<CommandResult> {
  const album = await changeableAlbum(id, context);
  if (isFailure(album)) return album;
  if (album.artworkUrl !== base.artworkUrl) {
    return conflict("artworkUrl", album.artworkUrl, artworkUrl, base.artworkUrl);
  }
  if (artworkUrl !== null && !isArtworkUrl(artworkUrl)) {
    return failure("validation_failed", artworkUrlRefusal, [
      { path: "args.artworkUrl", message: "Not an https link" },
    ]);
  }
  if (artworkUrl === album.artworkUrl) return applied();
  await context.store.updateAlbum(id, { artworkUrl });
  return applied({ entity: "album", id, op: "update", data: albumOf({ ...album, artworkUrl }) });
}

/**
 * `album.update`: changes the fields in `args` if each still holds its `base` value (TS-21). Fields not named are never
 * compared, so edits to different fields of one album all succeed.
 */
export async function updateAlbum(
  { id, ...values }: Partial<AlbumFields> & { id: string },
  base: Partial<AlbumFields>,
  context: CommandContext,
): Promise<CommandResult> {
  const album = await changeableAlbum(id, context);
  if (isFailure(album)) return album;

  const changed = albumFields.filter((field) => values[field] !== undefined);
  if (changed.length === 0) return nothingChanged();
  const unbased = baseProblem(albumFields, changed, base);
  if (unbased) return unbased;
  const conflicts = staleFields(changed, album, values, base);
  if (conflicts.length > 0) return { status: "conflict", conflicts };

  const next = albumOf({ ...album, ...values, id });
  const problem = albumProblem(next);
  if (problem) return problem;

  await context.store.updateAlbum(id, values);
  return applied({ entity: "album", id, op: "update", data: next });
}
