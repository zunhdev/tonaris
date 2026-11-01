// Search params the routes share (DS-32): an ID in the URL, such as the open album or a folder inside a share, is kept
// only when it is one, so a mistyped or truncated link opens the page without it.

import { isUuid } from "@tonaris/domain";

/** A route's `validateSearch` that keeps `key` when it holds an ID, and drops it and everything else otherwise. */
export function uuidSearch<Key extends string>(key: Key) {
  return (search: Record<string, unknown>): Partial<Record<Key, string>> => {
    const value = search[key];
    return isUuid(value) ? ({ [key]: value } as Partial<Record<Key, string>>) : {};
  };
}
