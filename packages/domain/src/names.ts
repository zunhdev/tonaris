// Name rules shared by folders, lists, fields and options (X-06). Commands check them under the owner's
// write lock against the active siblings; trashed and purged items reserve no names.

import { nameKey } from "./normalize";

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
