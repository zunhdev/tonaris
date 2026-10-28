// Name and search keys (TS-12). One implementation runs on the server, in the web client, behind MCP and in
// the export, so names collide and searches match the same way everywhere (X-02). Keys are stored with the
// row and never computed in SQL, whose case and accent tables differ from these.

const dotlessI = "ı";
const nonAscii = /\P{ASCII}/u;

/**
 * Unicode full case folding, code point by code point: "ß" and "ẞ" fold to "ss", "Σ" and "ς" to "σ".
 * Folding each code point through lower → upper → lower matches Unicode's CaseFolding.txt for every
 * character the engine knows (checked against Unicode 18 in normalize.test.ts), except that it would also
 * merge the Turkish dotless "ı" into "i", which Unicode keeps apart, so that one is left alone.
 */
export function caseFold(text: string): string {
  if (!nonAscii.test(text)) return text.toLowerCase();
  let folded = "";
  for (const character of text) {
    folded +=
      character === dotlessI ? character : character.toLowerCase().toUpperCase().toLowerCase();
  }
  return folded;
}

/**
 * The key that makes names unique (X-06, FR-03.9): trimmed, NFC, case-folded. Case-insensitive only:
 * "Favorites" and "favorites" collide, while "Café" and "Cafe" stay distinct.
 */
export function nameKey(name: string): string {
  return caseFold(name.trim().normalize("NFC")).normalize("NFC");
}

const withoutMarks = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "");

/**
 * The key search matches against (FR-12.5): NFKD, combining marks removed, case-folded, whitespace
 * collapsed. Case- and accent-insensitive: "Björk" becomes "bjork", "Straße" becomes "strasse".
 * Marks are removed again after folding, which can introduce them (e.g. "İ").
 */
export function searchKey(text: string): string {
  return withoutMarks(caseFold(withoutMarks(text)))
    .replace(/\s+/gu, " ")
    .trim();
}

/** Whether `query` matches `text` (FR-12.5): a substring of its search key, with no typo tolerance. */
export function searchMatches(query: string, text: string): boolean {
  return searchKey(text).includes(searchKey(query));
}

/**
 * How well a search key matches (FR-12.5), for ordering results (decided with the creator, 28 October 2026): 0
 * when the key starts with the query's key, 1 when a word in it does, 2 for any other substring, `undefined` for
 * no match or an empty query. A word starts after any character that is neither a letter nor a digit.
 */
export type SearchTier = 0 | 1 | 2;

const wordCharacter = /[\p{L}\p{N}]/u;

/** The character before `index`, whole when it is a surrogate pair. */
function before(text: string, index: number): string {
  const unit = text.charCodeAt(index - 1);
  const start = unit >= 0xdc00 && unit <= 0xdfff && index >= 2 ? index - 2 : index - 1;
  return String.fromCodePoint(text.codePointAt(start) ?? 0);
}

/** Where `queryKey` best matches in `key`: its first word-start occurrence, else its first. */
function bestMatch(queryKey: string, key: string): { index: number; tier: SearchTier } | undefined {
  if (queryKey === "") return undefined;
  const first = key.indexOf(queryKey);
  if (first < 0) return undefined;
  if (first === 0) return { index: 0, tier: 0 };
  for (let index = first; index >= 0; index = key.indexOf(queryKey, index + 1)) {
    if (!wordCharacter.test(before(key, index))) return { index, tier: 1 };
  }
  return { index: first, tier: 2 };
}

/** The tier of `key`'s match for `queryKey`, both search keys; `undefined` when it doesn't match. */
export function searchTier(queryKey: string, key: string): SearchTier | undefined {
  return bestMatch(queryKey, key)?.tier;
}

const space = /\s/u;
const mark = /\p{M}/u;

/**
 * `searchKey(text)` built code point by code point, with the range of `text` each of its UTF-16 units comes from.
 * `undefined` if it doesn't come out as `searchKey(text)`, rather than ranges that would be wrong.
 */
function keyWithSources(
  text: string,
): { key: string; starts: number[]; ends: number[] } | undefined {
  let key = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const character of text) {
    const end = at + character.length;
    for (const piece of withoutMarks(caseFold(withoutMarks(character)))) {
      if (space.test(piece)) {
        // Whitespace collapses to one space, and none leads.
        if (key === "" || key.endsWith(" ")) continue;
        key += " ";
        starts.push(at);
        ends.push(end);
        continue;
      }
      key += piece;
      for (let unit = 0; unit < piece.length; unit += 1) {
        starts.push(at);
        ends.push(end);
      }
    }
    at = end;
  }
  if (key.endsWith(" ")) {
    key = key.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return key === searchKey(text) ? { key, starts, ends } : undefined;
}

/**
 * The part of `text` that `query` matches, as `[start, end)` in UTF-16 units, for highlighting in the original
 * spelling (DS-75): "bjork" covers "Björk", and "ss" covers "ß". It covers the combining marks after its end, so a
 * decomposed letter is never split. `undefined` when it doesn't match.
 */
export function matchRange(query: string, text: string): [number, number] | undefined {
  const keyed = keyWithSources(text);
  const queryKey = searchKey(query);
  const match = keyed && bestMatch(queryKey, keyed.key);
  if (!keyed || !match) return undefined;
  const start = keyed.starts[match.index];
  let end = keyed.ends[match.index + queryKey.length - 1];
  if (start === undefined || end === undefined) return undefined;
  for (let next = text.codePointAt(end); next !== undefined; next = text.codePointAt(end)) {
    const character = String.fromCodePoint(next);
    if (!mark.test(character)) break;
    end += character.length;
  }
  return [start, end];
}
