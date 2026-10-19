// One store link through the TON-99 measurement, for Qobuz or Tidal: the album it truly is (labels.json, or
// MusicBrainz's URL relationship once any slug is known), the store page's hints, the MusicBrainz releases they
// find, and every rule's decision. Results keep the hints' date but none of the store's strings, not even the
// slug: nothing from the page may be kept (TON-17). Names in the report come from MusicBrainz, which is CC0.

import { type Label, searchCandidates, urlTruth } from "../g1-apple-hints/match";
import { type Decision, failedCriteria } from "../g1-apple-hints/rules";
import { parseLink } from "../g1-musicbrainz/links";
import type { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import type { StoreHints, StorePages } from "./qobuz";
import { decideQobuz, rules } from "./rules";

export type MatchResult = {
  index: number;
  input: string;
  sample?: string;
  /** Whether step 2 (the URL lookup, with the slug) already knows the link. */
  knownByUrl: boolean;
  truth?: Label;
  /** What the store requests gave, without the page's strings. */
  page?: {
    /** Requests to the store: for Qobuz, 1 for a store link or a title without Latin letters, else 2. */
    requests: number;
    /** Whether the link lacked a Qobuz slug, so request A ran. */
    slugRequest: boolean;
    date?: string;
    /** Whether og:title carries a version note the `MusicAlbum` name lacks. */
    versioned?: boolean;
    /** Why the page gave no hints. */
    problem?: string;
  };
  candidates: number;
  fallbackSearch?: boolean;
  rightAlbumFound?: boolean;
  /** Whether the hints' year is the right album's first year, or the year of one of its releases. */
  years?: { original: boolean; release: boolean };
  albumTitles: Record<string, string>;
  decisions: Record<string, Decision & { correct?: boolean }>;
  failed?: ReturnType<typeof failedCriteria>;
  error?: string;
};

const year = (date: string | undefined) => date?.slice(0, 4);

export async function matchLink(
  index: number,
  input: string,
  labels: Readonly<Record<string, Label>>,
  mb: MusicBrainz,
  pages: StorePages,
  explain?: (hints: StoreHints | undefined, result: MatchResult) => void,
): Promise<MatchResult> {
  const result: MatchResult = {
    index,
    input,
    knownByUrl: false,
    candidates: 0,
    albumTitles: {},
    decisions: {},
  };
  const parsed = parseLink(input);
  if (!parsed.ok || parsed.link.service !== pages.service || !parsed.link.albumId)
    return { ...result, error: parsed.ok ? `not a ${pages.service} album link` : parsed.reason };
  const { link } = parsed;

  // Requests A and B. Production would make B only after step 2 misses; the spike measures every link.
  const page = await pages.album(link);
  const { hints } = page;
  result.page = {
    requests: page.requests,
    slugRequest: page.slugRequested ?? false,
    ...(hints && { date: hints.date, versioned: hints.fullTitle !== hints.title }),
    ...(page.problem && { problem: page.problem }),
  };

  // Step 2 with the slug the store gave, so MusicBrainz's store URLs can match.
  const known = await urlTruth(input, page.slug ? { ...link, slug: page.slug } : link, labels, mb);
  result.knownByUrl = known.knownByUrl;
  if (known.truth) result.truth = known.truth;
  if (!hints) {
    explain?.(hints, result);
    return result;
  }

  const { candidates, fallbackSearch } = await searchCandidates(mb, hints.title, hints.artist);
  if (fallbackSearch) result.fallbackSearch = true;
  result.candidates = candidates.length;
  for (const c of candidates) result.albumTitles[c.releaseGroupId] = c.releaseGroupTitle;

  const truthGroups = result.truth?.releaseGroupIds ?? [];
  for (const rule of rules) {
    const decision = decideQobuz(rule, hints, candidates);
    result.decisions[rule.name] = {
      ...decision,
      ...(result.truth &&
        decision.releaseGroupId && { correct: truthGroups.includes(decision.releaseGroupId) }),
    };
  }
  if (result.truth) {
    const right = candidates.filter((c) => truthGroups.includes(c.releaseGroupId));
    result.rightAlbumFound = right.length > 0;
    if (right.length > 0) {
      result.failed = failedCriteria(hints, right);
      result.years = {
        original: right.some((c) => year(c.firstReleaseDate) === year(hints.date)),
        release: right.some((c) => year(c.date) === year(hints.date)),
      };
    }
  }
  explain?.(hints, result);
  return result;
}
