// TS-41 step 4 for the TON-16 spike: which MusicBrainz releases match the iTunes Lookup hints, and do they point
// to one album? The creator decided on 19 October 2026 that Tonaris identifies the album (the MusicBrainz release
// group) with its canonical title and original year, not the edition. So a rule succeeds when exactly one release
// group passes, whichever of its releases do. TS-41 as written, which needs exactly one release, is the baseline.

import { searchKey } from "@tonaris/domain";

import type { Hints } from "./itunes";

/** A MusicBrainz release from the search, with its release group's first release date when known. */
export type Candidate = {
  id: string;
  title: string;
  artistCredit: string;
  date?: string | undefined;
  trackCount: number;
  releaseGroupId: string;
  releaseGroupTitle: string;
  firstReleaseDate?: string | undefined;
  /** The credited names, the artists' names and their sort names ("Mumiy Troll'" for Мумий Тролль). */
  artistNames: string[];
};

export type Rule = {
  name: string;
  /** TS-41 as written needs exactly one release; the album rules need exactly one release group. */
  accept: "one-release" | "one-album";
  /**
   * `clean` drops Apple's " - EP" and " - Single" and edition notes such as "(Deluxe Edition)" on both sides.
   * `loose` also drops "(feat. …)" and compares letters and digits only.
   */
  title: "exact" | "clean" | "loose";
  /**
   * `first` compares only the first credited artist. `names` compares Apple's artist, or its first artist, with
   * any credited name, artist name or sort name, letters and digits only.
   */
  artist: "full" | "first" | "names";
  /** `near` allows one track more or fewer, such as a bonus track. */
  tracks: "exact" | "near" | "any";
  /**
   * `release`: Apple's date starts with the release's date, at whatever precision MusicBrainz has it.
   * `year`: the release's year. `original`: the release's year or its release group's first year.
   */
  date: "release" | "year" | "original" | "any";
};

const ts41: Rule = {
  name: "TS-41 as written: one release",
  accept: "one-release",
  title: "exact",
  artist: "full",
  tracks: "exact",
  date: "release",
};
const album: Rule = { ...ts41, name: "the same, one album", accept: "one-album" };
const clean: Rule = { ...album, name: "…clean titles", title: "clean" };
const original: Rule = { ...clean, name: "…and original year allowed", date: "original" };

const loose: Rule = {
  ...original,
  name: "…loose titles and artist names, no track count",
  title: "loose",
  artist: "names",
  tracks: "any",
};

/** Each rule changes one criterion from the one before, or from the rule it names. */
export const rules: readonly Rule[] = [
  ts41,
  album,
  clean,
  { ...clean, name: "…release year instead of date", date: "year" },
  original,
  { ...original, name: "…original year, tracks ±1", tracks: "near" },
  { ...original, name: "…original year, no track count", tracks: "any" },
  { ...original, name: "…original year, first artist only", artist: "first" },
  loose,
  { ...loose, name: "…loose, tracks ±1", tracks: "near" },
  { ...loose, name: "…loose, without the date", date: "any" },
];

/** The rule the report recommends and gives examples for. */
export const recommended = loose.name;

const editionNote =
  /\s*[([](?=[^)\]]*\b(?:deluxe|remaster(?:ed)?|edition|expanded|anniversary|bonus|version|mono|stereo|reissue|special|collector'?s|legacy|super|explicit|clean)\b)[^)\]]*[)\]]\s*$/i;

/** The title without Apple's " - EP"/" - Single" and without trailing edition notes. */
export function cleanTitle(title: string): string {
  let result = title.replace(/\s+-\s+(?:EP|Single)$/i, "");
  for (let previous = ""; previous !== result;) {
    previous = result;
    result = result.replace(editionNote, "");
  }
  return result.trim();
}

const featuring = /\s*[([](?:feat\.?|featuring|ft\.|with)\s[^)\]]*[)\]]/gi;

/** The title to search MusicBrainz for: clean, and without "(feat. …)", which MusicBrainz credits as artists. */
export function searchTitle(title: string): string {
  return cleanTitle(title.replaceAll(featuring, ""));
}

/** Letters and digits only, after the search key: "I miei ricordi...." and "I miei ricordi..." agree. */
export function looseKey(text: string): string {
  return searchKey(text).replaceAll(/[^\p{L}\p{N}]+/gu, "");
}

/** The first artist of a credit such as "A & B", "A, B", "A feat. B" or "A x B". */
export function firstArtist(credit: string): string {
  return (
    credit.split(/\s*(?:&|,|\band\b|\bfeat\.?|\bfeaturing\b|\bft\.|\bx\b|\bwith\b)\s*/i)[0] ??
    credit
  );
}

const year = (date: string | undefined) => date?.slice(0, 4);
const same = (a: string, b: string) => searchKey(a) === searchKey(b);

/** A sort name turned back into a name: "Celeste, Gianni" → "Gianni Celeste". */
const unsorted = (name: string) => name.replace(/^([^,]+),\s*([^,]+)$/, "$2 $1");

function titlesAgree(mode: Rule["title"], apple: string, candidate: string): boolean {
  if (mode === "exact") return same(apple, candidate);
  if (mode === "clean") return same(cleanTitle(apple), cleanTitle(candidate));
  return looseKey(searchTitle(apple)) === looseKey(searchTitle(candidate));
}

function artistsAgree(mode: Rule["artist"], apple: string, candidate: Candidate): boolean {
  if (mode === "full") return same(apple, candidate.artistCredit);
  if (mode === "first") return same(firstArtist(apple), firstArtist(candidate.artistCredit));
  const theirs = new Set(
    [candidate.artistCredit, ...candidate.artistNames, ...candidate.artistNames.map(unsorted)].map(
      looseKey,
    ),
  );
  return theirs.has(looseKey(apple)) || theirs.has(looseKey(firstArtist(apple)));
}

export function passes(rule: Rule, hints: Hints, candidate: Candidate): boolean {
  if (!titlesAgree(rule.title, hints.title, candidate.title)) return false;
  if (!artistsAgree(rule.artist, hints.artist, candidate)) return false;

  const trackGap = Math.abs(hints.trackCount - candidate.trackCount);
  if (rule.tracks === "exact" && trackGap !== 0) return false;
  if (rule.tracks === "near" && trackGap > 1) return false;

  const { date } = candidate;
  if (rule.date === "release") return Boolean(date && hints.date.startsWith(date));
  if (rule.date === "year") return year(date) === year(hints.date);
  if (rule.date === "original") {
    return year(date) === year(hints.date) || year(candidate.firstReleaseDate) === year(hints.date);
  }
  return true;
}

export type Decision = {
  outcome: "accepted" | "none" | "ambiguous";
  /** The album identified. */
  releaseGroupId?: string;
  /** Releases and albums that passed. */
  releases: number;
  albums: number;
};

/** Strict: accepted only when exactly one release, or for the album rules one release group, passes. */
export function decide(rule: Rule, hints: Hints, candidates: readonly Candidate[]): Decision {
  const passing = candidates.filter((c) => passes(rule, hints, c));
  const groups = [...new Set(passing.map((c) => c.releaseGroupId))];
  const counts = { releases: passing.length, albums: groups.length };
  const unique = rule.accept === "one-release" ? passing.length === 1 : groups.length === 1;
  const [groupId] = groups;
  if (unique && groupId) return { outcome: "accepted", releaseGroupId: groupId, ...counts };
  return { outcome: passing.length === 0 ? "none" : "ambiguous", ...counts };
}

/** Which criteria every release of the right album fails: what keeps a strict rule from matching it. */
export function failedCriteria(hints: Hints, rightReleases: readonly Candidate[]) {
  const none = (test: (c: Candidate) => boolean) => !rightReleases.some(test);
  return {
    titleExact: none((c) => same(hints.title, c.title)),
    titleClean: none((c) => same(cleanTitle(hints.title), cleanTitle(c.title))),
    artist: none((c) => same(hints.artist, c.artistCredit)),
    tracks: none((c) => c.trackCount === hints.trackCount),
    releaseDate: none((c) => Boolean(c.date && hints.date.startsWith(c.date))),
    originalYear: none(
      (c) => year(c.date) === year(hints.date) || year(c.firstReleaseDate) === year(hints.date),
    ),
  };
}
