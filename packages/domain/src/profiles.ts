// A person's profile (FR-11.16, TON-296): the avatar's color and an About text, beside the display name (FR-11.3).
// The avatar is the name's first letter on `oklch(0.52 0.12 h)` (DS-31): Automatic takes `h` from the name, or the
// person picks one of 12 hues, each keeping the white letter at 4.5:1. The About text is plain and short, and only the
// person's people see it (FR-07.23). Both change in the app only (X-03).

import { actingOwner, isFailure } from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import { maxAboutLength } from "./limits";
import { exceedsLength } from "./names";
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
