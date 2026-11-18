// A person's profile (FR-11.16, TON-296, TON-297): the avatar's color, an About text and up to four favorite albums,
// beside the display name (FR-11.3).
// The avatar is the name's first letter on `oklch(0.52 0.12 h)` (DS-31): Automatic takes `h` from the name, or the
// person picks one of 12 hues, each keeping the white letter at 4.5:1. The About text is plain and short, and only the
// person's people see it (FR-07.23). Both change in the app only (X-03).

import { actingOwner, isFailure } from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import { maxAboutLength, maxFavorites } from "./limits";
import { exceedsLength } from "./names";
import { failure } from "./outcomes";
import { z } from "./zod";

/** The hues a person can pick, every 30 degrees, with their names in Settings → Profile (DS-93). */
export const avatarHues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as const;
export type AvatarHue = (typeof avatarHues)[number];

/** A chosen hue, or null for Automatic. */
export const avatarHueSchema = z.int().min(0).max(330).multipleOf(30).nullable().meta({
  description: "The avatar's chosen hue in degrees; null for Automatic, from the name (DS-31).",
});

/** `account.setAvatarColor`'s argument. */
export const setAvatarColorArgsSchema = z.object({ avatarHue: avatarHueSchema });

/** The About text as kept: trimmed, with line breaks and runs of spaces as one space; null when blank. */
export function aboutOf(text: string | null): string | null {
  const about = (text ?? "").replace(/\s+/gu, " ").trim();
  return about === "" ? null : about;
}

/** `account.setAbout`'s argument: null or blank clears it. */
export const setAboutArgsSchema = z.object({
  // Counted in code points, as names are (TON-151); JSON Schema's `maxLength` counts them too.
  about: z
    .string()
    .refine((text) => !exceedsLength(aboutOf(text) ?? "", maxAboutLength), {
      message: `At most ${maxAboutLength} characters`,
    })
    .meta({ maxLength: maxAboutLength })
    .nullable(),
});

/** `account.setAvatarColor` (FR-11.16): the avatar's hue, or Automatic. App-only (X-03). */
export async function setAvatarColor(
  { avatarHue }: z.infer<typeof setAvatarColorArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const userId = actingOwner(
    context,
    "account",
    "Your avatar's color is changed in the app.",
    "Sign in to change your avatar.",
  );
  if (isFailure(userId)) return userId;
  await context.store.setAvatarHue(userId, avatarHue);
  return { status: "applied", changes: [], result: { avatarHue } };
}

/** `account.setAbout` (FR-11.16): the About text, plain and short; blank clears it. App-only (X-03). */
export async function setAbout(
  { about }: z.infer<typeof setAboutArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const userId = actingOwner(
    context,
    "account",
    "Your About text is changed in the app.",
    "Sign in to change your About text.",
  );
  if (isFailure(userId)) return userId;
  const kept = aboutOf(about);
  await context.store.setAbout(userId, kept);
  return { status: "applied", changes: [], result: { about: kept } };
}

/** `account.setFavorites`'s argument: the person's favorite albums, in order (TON-297). */
export const setFavoritesArgsSchema = z.object({
  albumIds: z
    .array(z.uuid())
    .max(maxFavorites)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Each album once" })
    .meta({
      description: `At most ${maxFavorites} of the person's own albums, in the order shown.`,
    }),
});

/** A favorite album as the person's people see it (FR-11.16): its cover, title and artist, and nothing else. */
export const favoriteSchema = z
  .object({
    title: z.string(),
    artistCredit: z.string(),
    artworkUrl: z.string().nullable(),
    artworkSignature: z.string().optional().meta({
      description: "The image proxy's signature of `artworkUrl`, when it has one (TS-103).",
    }),
  })
  .meta({ description: "A favorite album, by its cover, title and artist only (FR-11.16)." });
export type Favorite = z.infer<typeof favoriteSchema>;

/** `GET /v1/me/favorites`: the person's own favorites in order, those in Trash marked (TON-297). */
export const ownFavoritesSchema = z.object({
  favorites: z.array(
    favoriteSchema.extend({
      albumId: z.uuid(),
      trashed: z
        .boolean()
        .meta({ description: "In Trash: hidden from their people until restored." }),
    }),
  ),
});
export type OwnFavorites = z.infer<typeof ownFavoritesSchema>;

const notYours = "This album isn't in your collection.";

/**
 * `account.setFavorites` (FR-11.16): the person's favorites, replaced in order: their own albums only, in Trash or not,
 * so one in Trash keeps its place. Anyone else's album answers as a missing one. App-only (X-03).
 */
export async function setFavorites(
  { albumIds }: z.infer<typeof setFavoritesArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const userId = actingOwner(
    context,
    "account",
    "Your favorite albums are changed in the app.",
    "Sign in to change your favorite albums.",
  );
  if (isFailure(userId)) return userId;
  const albums = await Promise.all(albumIds.map((id) => context.store.findAlbum(id)));
  if (albums.some((album) => album?.ownerId !== userId)) return failure("not_found", notYours);
  await context.store.setFavorites(userId, albumIds);
  return { status: "applied", changes: [], result: { albumIds } };
}
