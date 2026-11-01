// Passkeys (FR-11.1, DS-93, TS-70): a second way to sign in, beside the emailed code, added and managed in
// Settings → Account. What a client sees of one, and the rules for renaming it.

import { maxNameLength } from "./limits";
import { exceedsLength, isBlankName } from "./names";
import { z } from "./zod";

/** The name a new passkey gets when its password manager isn't known, as for Apple's, which don't say. */
export const defaultPasskeyName = "Passkey";

/** A passkey on the account, as Settings → Account lists it. */
export const passkeySchema = z
  .object({
    id: z.uuid(),
    name: z.string().meta({
      description:
        "Its name: the password manager it is in when that is known, else `Passkey`, until the person renames it.",
    }),
    createdAt: z.iso.datetime().meta({ description: "When it was added." }),
  })
  .meta({ description: "A passkey that signs in to the account (FR-11.1)." });
export type Passkey = z.infer<typeof passkeySchema>;

/** Renames a passkey. */
export const passkeyRenameSchema = z.object({
  name: z.string().max(1000).meta({ description: "The new name; surrounding spaces are dropped." }),
});

/** Why renaming or removing a passkey is refused (DS-93), one sentence each. */
export const passkeyRefusalDetails = {
  none: "This passkey isn't on your account.",
  blank: "Give the passkey a name.",
  tooLong: `Names can be at most ${maxNameLength} characters.`,
} as const;

/** The name to keep, trimmed, or why it can't be kept: blank, or longer than other names may be. */
export function passkeyName(
  name: string,
): { ok: true; name: string } | { ok: false; refusal: "blank" | "tooLong" } {
  if (isBlankName(name)) return { ok: false, refusal: "blank" };
  const trimmed = name.trim();
  if (exceedsLength(trimmed, maxNameLength)) return { ok: false, refusal: "tooLong" };
  return { ok: true, name: trimmed };
}
