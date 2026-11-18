// What "Add a favorite" offers (DS-93, FR-11.16; TON-297): the person's albums not already favorites, found by typing,
// since there can be thousands. Each typed word must match the title or the artist, as search matches (FR-12.5,
// TON-201); titles matching the whole text come first, then by title. Pure, so the rules are tested without a DOM.

import { matchLimit, termsOf, type Matches } from "@/features/collection/list-picker";

import {
  byBytes,
  searchKey,
  searchText,
  searchTier,
  type Album,
  type SearchText,
} from "@tonaris/domain";

/** An album to pick, ready to match. */
export type AlbumChoice = {
  album: Album;
  titleKey: string;
  titleText: SearchText;
  artistText: SearchText;
};

/** The albums that can be picked: all but `except`, the favorites already, by title. */
export function albumChoices(albums: Iterable<Album>, except: Iterable<string>): AlbumChoice[] {
  const skip = new Set(except);
  const choices: AlbumChoice[] = [];
  for (const album of albums) {
    if (skip.has(album.id)) continue;
    choices.push({
      album,
      titleKey: searchKey(album.title),
      titleText: searchText(album.title),
      artistText: searchText(album.artistCredit),
    });
  }
  return choices.toSorted(
    (a, b) => byBytes(a.titleKey, b.titleKey) || byBytes(a.album.id, b.album.id),
  );
}

/** The albums `query` finds, best first, at most `matchLimit`; `choices` must be by title. */
export function findAlbums(choices: readonly AlbumChoice[], query: string): Matches<AlbumChoice> {
  const terms = termsOf(query);
  if (terms.length === 0) return { shown: [], total: 0 };
  const whole = terms.join(" ");
  const matched: { choice: AlbumChoice; tier: number }[] = [];
  for (const choice of choices) {
    const matches = (term: string) =>
      searchTier(term, choice.titleText) !== undefined ||
      searchTier(term, choice.artistText) !== undefined;
    if (!terms.every(matches)) continue;
    matched.push({ choice, tier: searchTier(whole, choice.titleText) ?? 3 });
  }
  // A stable sort keeps title order within a tier.
  const shown = matched
    .toSorted((a, b) => a.tier - b.tier)
    .slice(0, matchLimit)
    .map(({ choice }) => choice);
  return { shown, total: matched.length };
}

/** `ids` with the one at `at` moved `step` places, up (-1) or down (1); unchanged at either end. */
export function moved(ids: readonly string[], at: number, step: -1 | 1): string[] {
  const to = at + step;
  if (at < 0 || at >= ids.length || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  const [id] = next.splice(at, 1);
  if (id !== undefined) next.splice(to, 0, id);
  return next;
}
