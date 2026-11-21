// Words as Help's search reads them (FR-16.4, TON-314), shared by the search (engine.ts) and by a page that marks
// the words someone searched for (mark-words.tsx), which needn't load the search to do it.
// - A word matches its other forms (share, shared, sharing: Porter's stemmer), accents and capitals aside, and in
//   Latin letters, as the app's own search does (`latinKey`).
// - Little words (how, do, I, my) don't count, so a whole question works.
// - "Album's" is "album", and "can't" is "cant", a little word, rather than "can" and "t".

import { stemmer } from "stemmer";

import { latinKey } from "@tonaris/domain";

import { phraseSynonyms, synonymsOf } from "./synonyms";

const stopwords = new Set(
  "a an the to of in on at for and or but is are was be been it its my me i im ive you your we us our they them their how do does did can could would should will have has had get gets getting got cant dont doesnt didnt isnt arent wasnt wont youre youve theyre someone somebody something anyone anything everyone thing things what whats why where when which who whom with from this that these those there here about into by as if so am any some please want wanna need just".split(
    " ",
  ),
);

/** A text's words, as written. */
export const words = (text: string): string[] =>
  text
    .replaceAll(/['’]s\b/gu, "")
    .replaceAll(/(\p{L})['’](\p{L})/gu, "$1$2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** A word in Latin letters and lower case, with nothing but letters and digits: how words are compared. */
export const wordKey = (word: string): string => latinKey(word).replaceAll(/[^\p{L}\p{N}]/gu, "");

/** A word as search compares it, or null when it doesn't count. */
export function searchTerm(word: string): string | null {
  const key = wordKey(word);
  if (!key || stopwords.has(key)) return null;
  return stemmer(key);
}

/** The words of `text` that count. */
export const countedWords = (text: string): string[] =>
  words(text).filter((word) => searchTerm(word) !== null);

/** Text as phrases are compared: its words in Latin letters, one space apart, with a space either side. */
export const phraseKey = (text: string): string => ` ${words(text).map(latinKey).join(" ")} `;

/** What is marked for a search: the terms of its words, and the start of an unfinished last word. */
export type MarkedTerms = { terms: ReadonlySet<string>; start: string | undefined };

/** The terms to mark for `query`: its own words, and with `alternatives`, Tonaris's words for them. */
export function markedTerms(query: string, alternatives = true): MarkedTerms {
  const said = countedWords(query);
  const others = alternatives ? [...said.flatMap(synonymsOf), ...phraseSynonyms(query)] : [];
  const terms = new Set(
    [...said, ...others.flatMap(words)].flatMap((word) => searchTerm(word) ?? []),
  );
  const last = said.at(-1);
  const start = last === undefined ? undefined : wordKey(last);
  return { terms, start: start !== undefined && start.length >= 3 ? start : undefined };
}

/** Whether `word` in a text is one of the marked terms. */
export function isMarked(word: string, { terms, start }: MarkedTerms): boolean {
  const term = searchTerm(word);
  if (term === null) return false;
  return terms.has(term) || (start !== undefined && wordKey(word).startsWith(start));
}
