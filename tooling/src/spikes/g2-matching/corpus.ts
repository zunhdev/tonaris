// The TON-18 corpus logic: what MusicBrainz's releases and release groups say about editions and same-title
// albums, and the judgement a pair of same-title albums gets. build.ts fetches, run.ts evaluates; this file only
// decides, so it can be tested without the network.

import { cleanTitle, looseKey } from "../g1-apple-hints/rules";
import { parseLink, type Service } from "../g1-musicbrainz/links";

export type ReleaseGroup = {
  id: string;
  title: string;
  firstReleaseDate?: string;
  primaryType: string | null;
  secondaryTypes: string[];
  disambiguation: string;
};

/** How a release differs from its album's first release. An edition can be several at once. */
export type EditionKind =
  | "deluxe"
  | "remaster"
  | "anniversary"
  | "expanded"
  | "reissue"
  | "regional"
  | "original";

export type Edition = {
  releaseGroupId: string;
  releaseId: string;
  title: string;
  disambiguation: string;
  date?: string;
  country?: string;
  kinds: EditionKind[];
  /** Streaming links MusicBrainz relates to this release, in the forms parseLink reads. */
  links: string[];
};

const kindPatterns: readonly [EditionKind, RegExp][] = [
  ["deluxe", /\bdeluxe\b/i],
  ["remaster", /\bre-?master(?:ed)?\b/i],
  ["anniversary", /\banniversary\b/i],
  ["expanded", /\b(?:expanded|bonus|special|collector'?s|legacy|super)\b/i],
];

const year = (date?: string) => date?.slice(0, 4);

/**
 * What kind of edition a release is, from its title and disambiguation, then its date and country against the
 * album's first release. "Worldwide" (XW) digital releases aren't regional; a later one is a reissue.
 */
export function editionKinds(
  release: { title: string; disambiguation: string; date?: string; country?: string },
  first: { date?: string; country?: string },
): EditionKind[] {
  const text = `${release.title} ${release.disambiguation}`;
  const kinds = kindPatterns.flatMap(([kind, pattern]) => (pattern.test(text) ? [kind] : []));
  const releaseYear = year(release.date);
  const firstYear = year(first.date);
  if (releaseYear && firstYear && releaseYear > firstYear) kinds.push("reissue");
  if (
    release.country &&
    first.country &&
    release.country !== first.country &&
    release.country !== "XW" &&
    first.country !== "XW"
  ) {
    kinds.push("regional");
  }
  return kinds.length > 0 ? kinds : ["original"];
}

const streamingHosts = new Set([
  "open.spotify.com",
  "music.apple.com",
  "itunes.apple.com",
  "www.qobuz.com",
  "open.qobuz.com",
  "play.qobuz.com",
]);

/**
 * A streaming URL from a MusicBrainz relationship, as a link Tonaris would accept, or undefined. MusicBrainz
 * keeps older Apple links on itunes.apple.com, whose album ids are Apple Music's.
 */
export function streamingLink(resource: string): { link: string; service: Service } | undefined {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return undefined;
  }
  if (!streamingHosts.has(url.hostname)) return undefined;
  let href = url.href;
  if (url.hostname === "itunes.apple.com") {
    const match = /^\/(?:([a-z]{2})\/)?album\/(?:[^/]+\/)?(?:id)?(\d+)$/.exec(url.pathname);
    if (!match?.[2]) return undefined;
    href = `https://music.apple.com/${match[1] ?? "us"}/album/${match[2]}`;
  }
  const parsed = parseLink(href);
  return parsed.ok && parsed.link.kind === "album"
    ? { link: href, service: parsed.link.service }
    : undefined;
}

/** The title two albums are grouped by: edition notes dropped, then letters and digits only. */
export const titleKey = (title: string) => looseKey(cleanTitle(title));

/** One artist's release groups that share a title key, two or more to a group. */
export function sameTitleGroups(groups: readonly ReleaseGroup[]): ReleaseGroup[][] {
  const byKey = Map.groupBy(
    groups.filter((group) => titleKey(group.title) !== ""),
    (group) => titleKey(group.title),
  );
  return [...byKey.values()].filter((members) => members.length > 1);
}

/** Secondary types that make a different album even under the same title: a live album isn't the studio one. */
const distinctTypes = new Set([
  "Live",
  "Remix",
  "Soundtrack",
  "Demo",
  "Interview",
  "Spokenword",
  "DJ-mix",
]);

export type PairJudgement = {
  same: boolean;
  /** Why, in a few words. */
  reason: string;
  /** Whether a person should check it: a judgement from metadata alone, or one a two-album set could fool. */
  review: boolean;
  /** Both track lists' lengths and how many titles they share, when both are known. */
  tracks?: Tracks;
};

export type Tracks = { a: number; b: number; shared: number };

/** Two track lists compared on their titles; undefined if either is empty. */
export function compareTracks(a: ReadonlySet<string>, b: ReadonlySet<string>): Tracks | undefined {
  if (a.size === 0 || b.size === 0) return undefined;
  return { a: a.size, b: b.size, shared: [...a].filter((title) => b.has(title)).length };
}

const singular = new Set(["EP", "Single"]);

/**
 * Whether two same-title release groups of one artist are one album. With both track lists:
 * 1. the same track list (90% of the longer one) is one album, re-released or entered twice;
 * 2. an EP or single whose songs are all on an album is a different release;
 * 3. a release holding the whole of an earlier or same-year album is that album's expanded edition, unless the
 *    album held is itself a compilation: big best-ofs hold the hits of small ones;
 * 4. anything else is a different album.
 * Without them, metadata decides, erring towards "different". A live, remix or other distinct type is always a
 * different album. verdicts.ts records the pairs a person reviewed.
 */
export function judgePair(a: ReleaseGroup, b: ReleaseGroup, tracks?: Tracks): PairJudgement {
  const typesOf = (group: ReleaseGroup) =>
    group.secondaryTypes
      .filter((type) => distinctTypes.has(type))
      .toSorted()
      .join(",");
  if (typesOf(a) !== typesOf(b)) {
    return { same: false, reason: "live, remix or other distinct type", review: false };
  }
  if (!tracks) return judgeByMetadata(a, b);

  const [shorter, longer, short, long] =
    tracks.a <= tracks.b ? [a, b, tracks.a, tracks.b] : [b, a, tracks.b, tracks.a];
  if (tracks.shared >= 0.9 * long) {
    return { same: true, reason: "the same track list", review: false, tracks };
  }
  if (tracks.shared >= 0.9 * short) {
    if (singular.has(shorter.primaryType ?? "") && longer.primaryType === "Album") {
      return { same: false, reason: "an EP or single of the album's songs", review: false, tracks };
    }
    const later = (year(longer.firstReleaseDate) ?? "") >= (year(shorter.firstReleaseDate) ?? "");
    if (later && !shorter.secondaryTypes.includes("Compilation")) {
      return { same: true, reason: "an edition holding the whole album", review: true, tracks };
    }
  }
  return { same: false, reason: "other tracks", review: false, tracks };
}

/** The judgement from titles, years and types alone. */
function judgeByMetadata(a: ReleaseGroup, b: ReleaseGroup): PairJudgement {
  const noted = cleanTitle(a.title) !== a.title || cleanTitle(b.title) !== b.title;
  const sameYear = year(a.firstReleaseDate) === year(b.firstReleaseDate);
  if (noted && sameYear)
    return { same: true, reason: "an edition with its own release group", review: true };
  if (sameYear && a.primaryType === b.primaryType) {
    return { same: true, reason: "same title, year and type", review: true };
  }
  if (noted) return { same: false, reason: "an edition note, another year", review: true };
  return { same: false, reason: "another year", review: false };
}

/** A pair's key, independent of order. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
