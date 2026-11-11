// Name and search keys, and search matching (TS-12). One implementation runs on the server, in the web client, behind
// MCP and in the export, so names collide and searches match the same way everywhere (X-02). Keys are stored with the
// row and never computed in SQL, whose case and accent tables differ from these.

import { latinSpellings, otherSpellings } from "./spellings";

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
 * Text folded for ordering and comparison (FR-05.5): NFKD, combining marks removed, case-folded, whitespace
 * collapsed. Case- and accent-insensitive: "Björk" becomes "bjork", "Straße" becomes "strasse". Marks are removed
 * again after folding, which can introduce them (e.g. "İ"). Other alphabets stay as they are, so they keep their
 * place in a sort; search matches by `latinKey` and `searchText` instead (TON-201).
 */
export function searchKey(text: string): string {
  return withoutMarks(caseFold(withoutMarks(text)))
    .replace(/\s+/gu, " ")
    .trim();
}

// Search matching (FR-12.5, TON-201). Each letter of a text has one or more Latin spellings: its searchKey letter, or
// those `latinSpellings` gives ("ø" is "o" or "oe", "й" is "y", "i" or "j", "щ" is "shch", "sch" or "sht"). A query
// matches when, spelled in Latin by each letter's first spelling, it spells part of the text in any of them. The
// text's key is its letters' first spellings: what servers store, and the whole match when no letter has a choice.

type Spellings = readonly string[];

const space: Spellings = [" "];
const whitespace = /\s/u;
const mark = /\p{M}/u;
const onlyMarks = /^\p{M}*$/u;

/** One shared list per single spelling, so a text's letters are references, not copies. */
const single = new Map<string, Spellings>();
function spelled(piece: string): Spellings {
  if (whitespace.test(piece)) return space;
  let spellings = single.get(piece);
  if (!spellings) {
    spellings = [piece];
    single.set(piece, spellings);
  }
  return spellings;
}

const ascii: readonly (readonly Spellings[])[] = Array.from({ length: 128 }, (_, code) => [
  spelled(String.fromCharCode(code).toLowerCase()),
]);

/** Spellings by character and its marks, kept for the characters seen first. */
const seen = new Map<string, readonly Spellings[]>();
const seenLimit = 20_000;

/** The spellings of `character`, a character with the marks after it: one list per letter it gives. */
function spellingsOf(character: string): readonly Spellings[] {
  let letters = seen.get(character);
  if (letters) return letters;
  // The letter as composed, so "й" stays "й", even with a stress mark after it.
  const composed = caseFold(character.normalize("NFC")).normalize("NFC");
  const head = String.fromCodePoint(composed.codePointAt(0) ?? 0);
  const direct = onlyMarks.test(composed.slice(head.length)) ? latinSpellings.get(head) : undefined;
  if (direct) letters = direct.length === 0 ? [] : [direct];
  else {
    const pieces: Spellings[] = [];
    for (const piece of withoutMarks(caseFold(withoutMarks(character)))) {
      const spellings = latinSpellings.get(piece);
      if (spellings === undefined) pieces.push(spelled(piece));
      else if (spellings.length > 0) pieces.push(spellings);
    }
    letters = pieces;
  }
  if (seen.size < seenLimit) seen.set(character, letters);
  return letters;
}

/**
 * Each letter of `text`'s key with its spellings and the range of `text` it comes from, in order: whitespace runs
 * become one space, with none at either end. A character and the marks after it are one, so a match never splits them.
 * A character that gives no letter, such as "ь", is reported to `dropped` with where it ends.
 */
function eachLetter(
  text: string,
  visit: (spellings: Spellings, start: number, end: number) => void,
  dropped?: (end: number) => void,
) {
  let started = false;
  let gap: [number, number] | undefined;
  let at = 0;
  while (at < text.length) {
    const start = at;
    const code = text.codePointAt(at) ?? 0;
    at += code > 0xffff ? 2 : 1;
    for (let next = text.codePointAt(at); next !== undefined; next = text.codePointAt(at)) {
      if (next < 0x300 || !mark.test(String.fromCodePoint(next))) break;
      at += next > 0xffff ? 2 : 1;
    }
    const letters =
      at - start === 1 && code < 0x80 ? (ascii[code] ?? []) : spellingsOf(text.slice(start, at));
    if (letters.length === 0 && started && !gap) dropped?.(at);
    for (const spellings of letters) {
      if (spellings === space) {
        if (started) gap ??= [start, at];
        continue;
      }
      if (gap) visit(space, ...gap);
      gap = undefined;
      visit(spellings, start, at);
      started = true;
    }
  }
}

const isAscii = (text: string) => !nonAscii.test(text);
const asciiKey = (text: string) => text.toLowerCase().replace(/\s+/gu, " ").trim();

/**
 * The key search stores and orders results by (TS-12, TS-50): `searchKey`, with each letter in its first Latin
 * spelling. "Røyksopp" becomes "royksopp", "Кино" "kino", "Die Ärzte" "die arzte". A query is spelled the same way.
 */
export function latinKey(text: string): string {
  if (isAscii(text)) return asciiKey(text);
  let key = "";
  eachLetter(text, (spellings) => {
    key += spellings[0];
  });
  return key;
}

/** A text ready to match: its `latinKey`, and its letters' spellings when one of them has a choice. */
export type SearchText = { readonly key: string; readonly letters?: readonly Spellings[] };

export function searchText(text: string): SearchText {
  if (isAscii(text)) return { key: asciiKey(text) };
  let key = "";
  const letters: Spellings[] = [];
  let choice = false;
  eachLetter(text, (spellings) => {
    key += spellings[0];
    letters.push(spellings);
    choice ||= spellings.length > 1;
  });
  return choice ? { key, letters } : { key };
}

/**
 * How well a text matches (FR-12.5), for ordering results (decided with the creator, 28 October 2026): 0 when it
 * starts with the query, 1 when a word in it does, 2 for any other match, `undefined` for no match or an empty query.
 * A word starts after any character that is neither a letter nor a digit.
 */
export type SearchTier = 0 | 1 | 2;

const wordCharacter = /[\p{L}\p{N}]/u;

/** The character before `index`, whole when it is a surrogate pair. */
function before(text: string, index: number): string {
  const unit = text.charCodeAt(index - 1);
  const start = unit >= 0xdc00 && unit <= 0xdfff && index >= 2 ? index - 2 : index - 1;
  return String.fromCodePoint(text.codePointAt(start) ?? 0);
}

type Match = { tier: SearchTier; first: number; last: number };

/** Where `queryKey` best matches in `key`, as indexes into it: its start, else its first word start, else its first. */
function keyMatch(queryKey: string, key: string): Match | undefined {
  const found = key.indexOf(queryKey);
  if (found < 0) return undefined;
  const last = (index: number) => index + queryKey.length - 1;
  if (found === 0) return { tier: 0, first: 0, last: last(0) };
  for (let index = found; index >= 0; index = key.indexOf(queryKey, index + 1)) {
    if (!wordCharacter.test(before(key, index)))
      return { tier: 1, first: index, last: last(index) };
  }
  return { tier: 2, first: found, last: last(found) };
}

/** Whether `a` from `aAt` and `b` from `bAt` agree for `length` code units. */
function agree(a: string, aAt: number, b: string, bAt: number, length: number): boolean {
  for (let k = 0; k < length; k += 1) {
    if (a.charCodeAt(aAt + k) !== b.charCodeAt(bAt + k)) return false;
  }
  return true;
}

/**
 * The last letter of a match of `queryKey` starting at `letters[from]`, at the start of one of its spellings or, when
 * `inside`, within one; -1 for none. Every spelling of each later letter is tried, so letters may mix spellings.
 */
function matchFrom(
  queryKey: string,
  letters: readonly Spellings[],
  from: number,
  inside: boolean,
): number {
  let reached: number[] = [];
  for (const spelling of letters[from] ?? []) {
    const offsets = inside ? spelling.length : Math.min(1, spelling.length);
    for (let offset = inside ? 1 : 0; offset < offsets; offset += 1) {
      const rest = spelling.length - offset;
      if (queryKey.length <= rest) {
        if (agree(spelling, offset, queryKey, 0, queryKey.length)) return from;
      } else if (agree(spelling, offset, queryKey, 0, rest) && !reached.includes(rest)) {
        reached.push(rest);
      }
    }
  }
  for (let at = from + 1; reached.length > 0 && at < letters.length; at += 1) {
    const next: number[] = [];
    for (const position of reached) {
      const left = queryKey.length - position;
      for (const spelling of letters[at] ?? []) {
        if (left <= spelling.length) {
          if (agree(spelling, 0, queryKey, position, left)) return at;
        } else if (
          queryKey.startsWith(spelling, position) &&
          !next.includes(position + spelling.length)
        ) {
          next.push(position + spelling.length);
        }
      }
    }
    reached = next;
  }
  return -1;
}

/** Where `queryKey` best matches across `letters`, as indexes into them, ranked as `keyMatch` ranks. */
function lettersMatch(queryKey: string, letters: readonly Spellings[]): Match | undefined {
  let found: Match | undefined;
  for (let from = 0; from < letters.length; from += 1) {
    const last = matchFrom(queryKey, letters, from, false);
    if (last >= 0) {
      if (from === 0) return { tier: 0, first: 0, last };
      const previous = letters[from - 1]?.[0] ?? "";
      if (!wordCharacter.test(before(previous, previous.length))) {
        return { tier: 1, first: from, last };
      }
      found ??= { tier: 2, first: from, last };
    }
    if (!found) {
      const within = matchFrom(queryKey, letters, from, true);
      if (within >= 0) found = { tier: 2, first: from, last: within };
    }
  }
  return found;
}

/** The tier of `text`'s match for `queryKey`, a query's `latinKey`; `undefined` when it doesn't match. */
export function searchTier(queryKey: string, text: SearchText): SearchTier | undefined {
  if (queryKey === "") return undefined;
  return (text.letters ? lettersMatch(queryKey, text.letters) : keyMatch(queryKey, text.key))?.tier;
}

/** Whether `query` matches `text` (FR-12.5): part of it in any of its spellings, with no typo tolerance. */
export function searchMatches(query: string, text: string): boolean {
  return searchTier(latinKey(query), searchText(text)) !== undefined;
}

/**
 * The part of `text` that `query` matches, as `[start, end)` in UTF-16 units, for highlighting in the original
 * spelling (DS-75): "bjork" covers "Björk", "ss" covers "ß", and "kino" covers "Кино". It covers whole characters
 * with their marks, and a dropped letter after its last. `undefined` when it doesn't match.
 */
export function matchRange(query: string, text: string): [number, number] | undefined {
  const queryKey = latinKey(query);
  if (queryKey === "") return undefined;
  const letters: Spellings[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  eachLetter(
    text,
    (spellings, start, end) => {
      letters.push(spellings);
      starts.push(start);
      ends.push(end);
    },
    // A dropped letter goes with the one before it: "troll" covers all of "Тролль".
    (end) => ends.splice(-1, 1, end),
  );
  const match = lettersMatch(queryKey, letters);
  const start = match && starts[match.first];
  const end = match && ends[match.last];
  return start === undefined || end === undefined ? undefined : [start, end];
}

/**
 * The parts of `queryKey`, a query's `latinKey`, that every key it matches contains, in order (TS-50): what a server
 * can look for in stored keys before matching exactly. A part of the query that may be another spelling of a letter
 * ("ae" for "ä", "h" for "х") isn't in the key as typed, so it splits the parts; it may be anything there.
 */
export function searchParts(queryKey: string): string[] {
  const loose = Array.from({ length: queryKey.length }, () => false);
  const loosen = (from: number, to: number) => {
    for (let index = Math.max(0, from); index < Math.min(to, queryKey.length); index += 1) {
      loose[index] = true;
    }
  };
  for (const spelling of otherSpellings) {
    if (spelling.includes(queryKey)) loosen(0, queryKey.length);
    for (let at = queryKey.indexOf(spelling); at >= 0; at = queryKey.indexOf(spelling, at + 1)) {
      loosen(at, at + spelling.length);
    }
    for (let cut = 1; cut < spelling.length; cut += 1) {
      if (queryKey.startsWith(spelling.slice(cut))) loosen(0, spelling.length - cut);
      if (queryKey.endsWith(spelling.slice(0, cut))) loosen(queryKey.length - cut, queryKey.length);
    }
  }
  const parts: string[] = [];
  let part = "";
  for (let index = 0; index < queryKey.length; index += 1) {
    if (loose[index]) {
      if (part !== "") parts.push(part);
      part = "";
    } else part += queryKey[index];
  }
  if (part !== "") parts.push(part);
  return parts;
}
