// Name rules shared by folders, lists, fields and options (X-06). Commands check them under the owner's
// write lock against the active siblings; trashed and purged items reserve no names. Every text limit counts the
// same way.

import { nameKey } from "./normalize";
import { z } from "./zod";

/**
 * Whether `text` is longer than `limit`, counted in code points rather than graphemes: limits bound stored text
 * (TS-18), and a grapheme can hold any number of code points.
 */
export function exceedsLength(text: string, limit: number): boolean {
  // oxlint-disable-next-line no-misused-spread
  return [...text].length > limit;
}

/**
 * `text` cut to `limit` code points: what a field that takes no more keeps of a longer paste. An input's own
 * `maxLength` counts UTF-16 units, so it would stop an emoji-rich name short of the limit (TON-151).
 */
export function clipLength(text: string, limit: number): string {
  // oxlint-disable-next-line no-misused-spread
  return exceedsLength(text, limit) ? [...text].slice(0, limit).join("") : text;
}

/**
 * A person's text of at most `limit` code points, as every text limit counts (TS-18). A string schema's own max counts
 * UTF-16 units, which stops emoji-rich text short (TON-151), so `check:refs` flags it outside machine strings
 * (DRIFT-103). JSON Schema's `maxLength` counts code points too, so the contract says the same.
 */
export function textSchema(limit: number) {
  return z
    .string()
    .refine((text) => !exceedsLength(text, limit), { message: `At most ${limit} characters` })
    .meta({ maxLength: limit });
}

/** Blank names are invalid (X-06): empty, or only whitespace. */
export function isBlankName(name: string): boolean {
  return name.trim() === "";
}

export type NamedItem = { id: string; name: string };

/**
 * The item among `siblings` whose name collides with `name`, if any. The item being renamed (`selfId`)
 * never collides with itself, so a case-only rename ("jazz" → "Jazz") is allowed and keeps the new spelling.
 */
export function findNameConflict<T extends NamedItem>(
  name: string,
  siblings: readonly T[],
  selfId?: string,
): T | undefined {
  const key = nameKey(name);
  return siblings.find((sibling) => sibling.id !== selfId && nameKey(sibling.name) === key);
}
