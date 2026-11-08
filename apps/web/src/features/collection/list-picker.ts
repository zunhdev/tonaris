// What "Add to a list" offers (DS-46, TON-177): the owner's lists an album isn't in, found by typing, since there can
// be thousands. Before anything is typed, the lists albums were most recently added to, then others by path, 8 in all.
// Typed words must each appear in a list's path, its folders' names and its own; lists whose name matches the whole
// text come first, as search orders names (FR-12.5), then the rest, each by path. "Find a folder" finds folders the
// same way (TON-183). Pure, so the rules are tested without a DOM.

import {
  byBytes,
  matchRange,
  searchKey,
  searchTier,
  type Container,
  type Membership,
} from "@tonaris/domain";

import { ancestorsOf, type Tree } from "./tree";

/** A list or folder to find by its path, as "Find a list" and "Find a folder" do (TON-183). */
export type PathChoice = {
  /** The folders' names, top first, then its own. */
  path: readonly string[];
  /** The path's search key, its names joined by " › ". */
  pathKey: string;
  nameKey: string;
};

/** A list the album can go into, with the folders above it. */
export type ListChoice = PathChoice & { list: Container };

/** How many lists, or folders, show before anything is typed. */
export const suggestedCount = 8;
/** How many matches show at most; more ask for more typing. */
export const matchLimit = 50;

/** The lists not in `except`, ordered by path. */
export function listChoices(tree: Tree, except: Iterable<string>): ListChoice[] {
  const skip = new Set(except);
  const choices: ListChoice[] = [];
  for (const list of tree.byId.values()) {
    if (list.kind !== "list" || skip.has(list.id)) continue;
    const path = [...ancestorsOf(tree, list.id).map((folder) => folder.name), list.name];
    choices.push({
      list,
      path,
      pathKey: searchKey(path.join(" › ")),
      nameKey: searchKey(list.name),
    });
  }
  return choices.toSorted((a, b) => byBytes(a.pathKey, b.pathKey) || byBytes(a.list.id, b.list.id));
}

export type Suggestions = {
  /** Lists albums were added to, the latest first. */
  recent: ListChoice[];
  /** Other lists by path, filling up to `suggestedCount`. */
  others: ListChoice[];
  /** How many more there are to find by typing. */
  hidden: number;
};

/** What shows before anything is typed: `choices` must be in path order, as `listChoices` gives them. */
export function suggestions(
  choices: readonly ListChoice[],
  entriesByList: ReadonlyMap<string, readonly Pick<Membership, "addedAt">[]>,
): Suggestions {
  const latest = new Map<string, string>();
  for (const { list } of choices) {
    for (const { addedAt } of entriesByList.get(list.id) ?? []) {
      const was = latest.get(list.id);
      if (was === undefined || addedAt > was) latest.set(list.id, addedAt);
    }
  }
  const recent = choices
    .filter(({ list }) => latest.has(list.id))
    .toSorted((a, b) => byBytes(latest.get(b.list.id) ?? "", latest.get(a.list.id) ?? ""))
    .slice(0, suggestedCount);
  const shown = new Set(recent.map(({ list }) => list.id));
  const others = choices
    .filter(({ list }) => !shown.has(list.id))
    .slice(0, suggestedCount - recent.length);
  return { recent, others, hidden: choices.length - recent.length - others.length };
}

/** The words of `query`, as search keys; none for blank text. */
export const termsOf = (query: string): string[] =>
  searchKey(query)
    .split(" ")
    .filter((term) => term !== "");

export type Matches<T> = { shown: T[]; total: number };

/** The lists or folders `query` finds, best first, at most `matchLimit`; `choices` must be in path order. */
export function findByPath<T extends PathChoice>(choices: readonly T[], query: string): Matches<T> {
  const terms = termsOf(query);
  if (terms.length === 0) return { shown: [], total: 0 };
  const whole = terms.join(" ");
  const matched: { choice: T; tier: number }[] = [];
  for (const choice of choices) {
    if (!terms.every((term) => choice.pathKey.includes(term))) continue;
    matched.push({ choice, tier: searchTier(whole, choice.nameKey) ?? 3 });
  }
  // A stable sort keeps path order within a tier.
  const shown = matched
    .toSorted((a, b) => a.tier - b.tier)
    .slice(0, matchLimit)
    .map(({ choice }) => choice);
  return { shown, total: matched.length };
}

/**
 * The parts of `name`, one name in a path, that the typed words match, as `[start, end)` ranges in its own spelling,
 * in order and not overlapping, for highlighting (DS-75).
 */
export function matchedParts(name: string, terms: readonly string[]): [number, number][] {
  const ranges = terms
    .map((term) => matchRange(term, name))
    .filter((range) => range !== undefined)
    .toSorted((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
