// How TON-18 scores the TS-44 rules: same-title pairs under the release-group rule and under title similarity,
// and which edition links to identify and how their outcomes read. Pure, so the scoring is tested.

import type { Service } from "../g1-musicbrainz/links";
import { type Edition, type EditionKind, pairKey, type PairJudgement } from "./corpus";

export type Pair = PairJudgement & { a: string; b: string };
export type Truth = { a: string; b: string; same: boolean; reviewed: boolean; note: string };

/** A pair's truth: the reviewed verdict when there is one, the heuristic otherwise. */
export function truthOf(
  pair: Pair,
  verdicts: Readonly<Record<string, { same: boolean; note: string }>>,
): Truth {
  const verdict = verdicts[pairKey(pair.a, pair.b)];
  return verdict
    ? { a: pair.a, b: pair.b, same: verdict.same, reviewed: true, note: verdict.note }
    : { a: pair.a, b: pair.b, same: pair.same, reviewed: false, note: pair.reason };
}

/**
 * TS-44 keeps two release groups apart, so it is right on different albums and splits one album that MusicBrainz
 * keeps under two. Matching on title and artist would merge every pair: right on one album, wrong on two.
 */
export function scorePairs(truths: readonly Truth[]) {
  const same = truths.filter((t) => t.same).length;
  const different = truths.length - same;
  return {
    pairs: truths.length,
    releaseGroup: { right: different, splits: same },
    similarity: { right: same, wrongMerges: different },
  };
}

export type Selected = {
  link: string;
  service: Service;
  releaseGroupId: string;
  kinds: EditionKind[];
};

/** How far an edition is from the album's first release: how many ways it differs. */
const variance = (e: Edition) => (e.kinds.includes("original") ? 0 : e.kinds.length);

/**
 * The edition links to identify: for each album, its editions that differ most from the first release, at most
 * one link per service and `perAlbum` links in all; then at most `caps[service]` links per service overall.
 */
export function selectLinks(
  editions: readonly Edition[],
  serviceOf: (link: string) => Service | undefined,
  perAlbum: number,
  caps: Readonly<Record<Service, number>>,
): Selected[] {
  const byAlbum = Map.groupBy(editions, (e) => e.releaseGroupId);
  const picked: Selected[] = [];
  for (const [releaseGroupId, albumEditions] of byAlbum) {
    const ordered = albumEditions.toSorted(
      (a, b) => variance(b) - variance(a) || (b.date ?? "").localeCompare(a.date ?? ""),
    );
    const services = new Set<Service>();
    for (const edition of ordered) {
      for (const link of edition.links) {
        const service = serviceOf(link);
        if (!service || services.has(service) || services.size >= perAlbum) continue;
        services.add(service);
        picked.push({ link, service, releaseGroupId, kinds: edition.kinds });
      }
    }
  }
  const counts = new Map<Service, number>();
  return picked.filter((s) => {
    const n = (counts.get(s.service) ?? 0) + 1;
    counts.set(s.service, n);
    return n <= caps[s.service];
  });
}

export type Outcome =
  /** The album the link belongs to. */
  | "right"
  /** Another release group of the same album: MusicBrainz keeps it under two. */
  | "split"
  /** A different album. */
  | "wrong"
  /** Several albums: the person confirms (TS-26). */
  | "several"
  | "none"
  /** No identifier bridge applies, such as an alphanumeric Qobuz id. */
  | "no bridge"
  | "error";

/** What one identification found, against the album the link belongs to and the reviewed same-album pairs. */
export function classify(
  expected: string,
  found: readonly string[],
  sameAlbum: (a: string, b: string) => boolean,
): Outcome {
  const albums = [...new Set(found)];
  const [only] = albums;
  if (albums.length > 1) return "several";
  if (!only) return "none";
  if (only === expected) return "right";
  return sameAlbum(expected, only) ? "split" : "wrong";
}
