// TS-41 step 4: hints for a strict MusicBrainz match, as decided on 21 October 2026 from the G1 spikes (TON-16,
// TON-99, TON-100) and G2 (TON-18). A store's title, artist and date search MusicBrainz, and a match is accepted
// only when exactly one album passes:
// - titles agree on letters and digits, once cleaned;
// - the hint's artist, or its first artist, is a credited, artist or sort name;
// - the year is the release's or its album's first;
// - the release is official, of an album or an EP, or of a single when Apple's title says " - Single".
// The track count is ignored: it never stopped a wrong match, and bonus tracks cost right ones. YouTube Music's hints
// are the exception (TON-131): an album playlist's count must be a passing release's, so an EP of the album's name
// isn't taken for it, as the spike's one error was (TON-128).

import { z } from "zod";

import { searchKey } from "@tonaris/domain";

import type { MusicBrainz } from "./musicbrainz";
import { artistCreditSchema, creditText, searchByTitle, yearOf } from "./musicbrainz-answers";

/**
 * What a store says about an album. `date` is `YYYY-MM-DD`, or coarser. `tracks`, which only YouTube's hints carry,
 * must be a passing release's track count.
 */
export type Hints = { title: string; artist: string; date: string; tracks?: number };

/** A MusicBrainz release the search found, with what the rule compares. */
export type Candidate = {
  releaseId: string;
  title: string;
  artistCredit: string;
  /** The credited names, the artists' names and their sort names ("Mumiy Troll'" for Мумий Тролль). */
  artistNames: string[];
  date?: string | undefined;
  status?: string | undefined;
  trackCount?: number | undefined;
  releaseGroupId: string;
  releaseGroupTitle: string;
  primaryType?: string | undefined;
  firstReleaseDate?: string | undefined;
};

export type HintMatch =
  | { kind: "one"; releaseGroupId: string }
  | { kind: "several"; albums: { releaseGroupId: string; title: string }[] }
  | { kind: "none" };

const editionNote =
  /\s*[([](?=[^)\]]*\b(?:deluxe|remaster(?:ed)?|edition|expanded|anniversary|bonus|version|mono|stereo|reissue|special|collector'?s|legacy|super|explicit|clean|standard)\b)[^)\]]*[)\]]\s*$/i;
/** Notes that name a re-recording, which is its own album: "(Taylor's Version)", "(Re-Recorded)". */
const reRecording = /\p{L}['’]s\s+version|\bre-?recorded\b/iu;
const singleSuffix = /\s+-\s+Single$/i;

/**
 * The title without Apple's " - EP" and " - Single" and without trailing edition notes, such as "(Deluxe Edition)",
 * "[2018 Remaster]" or "(Standard)". A re-recording's note stays, so it never searches as its original.
 */
export function cleanTitle(title: string): string {
  let result = title.replace(/\s+-\s+(?:EP|Single)$/i, "");
  for (let note = editionNote.exec(result); note; note = editionNote.exec(result)) {
    if (reRecording.test(note[0])) break;
    result = result.slice(0, note.index);
  }
  return result.trim();
}

const featuring = /\s*[([](?:feat\.?|featuring|ft\.|with)\s[^)\]]*[)\]]/gi;

/** The title to search for: clean, and without "(feat. …)", which MusicBrainz credits as artists. */
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

/** A sort name turned back into a name: "Celeste, Gianni" → "Gianni Celeste". */
const unsorted = (name: string) => name.replace(/^([^,]+),\s*([^,]+)$/, "$2 $1");

/** Whether a release passes the rule for these hints. */
export function passes(hints: Hints, candidate: Candidate): boolean {
  const types = singleSuffix.test(hints.title) ? ["Album", "EP", "Single"] : ["Album", "EP"];
  if (candidate.status !== "Official" || !types.includes(candidate.primaryType ?? "")) return false;
  if (looseKey(searchTitle(hints.title)) !== looseKey(searchTitle(candidate.title))) return false;
  const names = new Set(
    [candidate.artistCredit, ...candidate.artistNames, ...candidate.artistNames.map(unsorted)].map(
      looseKey,
    ),
  );
  if (!names.has(looseKey(hints.artist)) && !names.has(looseKey(firstArtist(hints.artist)))) {
    return false;
  }
  if (hints.tracks !== undefined && candidate.trackCount !== hints.tracks) return false;
  const hinted = yearOf(hints.date);
  return (
    hinted !== undefined &&
    (yearOf(candidate.date) === hinted || yearOf(candidate.firstReleaseDate) === hinted)
  );
}

/** Accepted only when exactly one album passes, whichever of its releases do. */
export function decide(hints: Hints, candidates: readonly Candidate[]): HintMatch {
  const albums = new Map<string, string>();
  for (const candidate of candidates) {
    if (passes(hints, candidate)) albums.set(candidate.releaseGroupId, candidate.releaseGroupTitle);
  }
  const [only] = albums.keys();
  if (albums.size === 1 && only) return { kind: "one", releaseGroupId: only };
  if (albums.size === 0) return { kind: "none" };
  return {
    kind: "several",
    albums: [...albums].map(([releaseGroupId, title]) => ({ releaseGroupId, title })),
  };
}

const releaseSearchSchema = z.object({
  releases: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        date: z.string().optional(),
        status: z.string().nullish(),
        "track-count": z.number().optional(),
        "artist-credit": artistCreditSchema,
        "release-group": z.object({
          id: z.string(),
          title: z.string(),
          "primary-type": z.string().nullish(),
        }),
      }),
    )
    .default([]),
});
const groupSearchSchema = z.object({
  "release-groups": z
    .array(z.object({ id: z.string(), "first-release-date": z.string().nullish() }))
    .default([]),
});

/**
 * The releases the hints find: by title and first artist, or by title alone when the artist as the store spells
 * it finds nothing, such as "Mumiy Troll" for Мумий Тролль. Each gets its album's first release date.
 */
export async function searchCandidates(
  musicBrainz: MusicBrainz,
  hints: Hints,
): Promise<Candidate[]> {
  const found = await searchByTitle(
    "release",
    { title: searchTitle(hints.title), artist: firstArtist(hints.artist) },
    async (query) =>
      releaseSearchSchema.parse(await musicBrainz.search("release", query, 100)).releases,
  );
  const groupIds = [...new Set(found.map((release) => release["release-group"].id))].slice(0, 50);
  const firstDates = new Map<string, string | undefined>();
  if (groupIds.length > 0) {
    const groups = groupSearchSchema.parse(
      await musicBrainz.search(
        "release-group",
        groupIds.map((id) => `rgid:${id}`).join(" OR "),
        100,
      ),
    )["release-groups"];
    for (const group of groups) firstDates.set(group.id, group["first-release-date"] ?? undefined);
  }
  return found.map((release) => {
    const credits = release["artist-credit"] ?? [];
    return {
      releaseId: release.id,
      title: release.title,
      artistCredit: creditText(credits),
      artistNames: credits.flatMap((credit) =>
        credit.artist
          ? [credit.name, credit.artist.name, credit.artist["sort-name"] ?? credit.artist.name]
          : [credit.name],
      ),
      date: release.date || undefined,
      status: release.status ?? undefined,
      trackCount: release["track-count"],
      releaseGroupId: release["release-group"].id,
      releaseGroupTitle: release["release-group"].title,
      primaryType: release["release-group"]["primary-type"] ?? undefined,
      firstReleaseDate: firstDates.get(release["release-group"].id) || undefined,
    };
  });
}

/** Step 4 for one set of hints: the search, then the rule. */
export async function matchHints(musicBrainz: MusicBrainz, hints: Hints): Promise<HintMatch> {
  return decide(hints, await searchCandidates(musicBrainz, hints));
}
