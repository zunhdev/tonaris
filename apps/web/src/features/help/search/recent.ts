// The last few searches someone chose a result for, on this device (DS-122, the creator's pick 3A): an empty search
// offers them again. Kept in localStorage; where it can't be, there are none.

import { readJson, writeJson } from "@/common/storage";

const key = "tonaris.help.recentSearches";
const kept = 5;

export function recentSearches(): string[] {
  const value = readJson(key);
  return Array.isArray(value)
    ? value.filter((each) => typeof each === "string").slice(0, kept)
    : [];
}

export function addRecentSearch(query: string): void {
  const text = query.trim();
  if (text === "") return;
  const others = recentSearches().filter((each) => each.toLowerCase() !== text.toLowerCase());
  writeJson(key, [text, ...others].slice(0, kept));
}
