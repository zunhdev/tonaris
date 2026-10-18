// One Apple Music link through the TON-16 measurement: the album it truly is (labels.json, or MusicBrainz's URL
// relationship), the iTunes Lookup hints, the MusicBrainz releases those hints find, and every rule's decision.
// Results keep Apple's numbers (date, track count) but not its title or artist strings: what may be kept from
// iTunes Lookup waits on the terms review (TON-17). Names in the report come from MusicBrainz, which is CC0.

import { z } from "zod";

import { urlCandidates } from "../g1-musicbrainz/chain";
import { parseLink } from "../g1-musicbrainz/links";
import type { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import type { Itunes } from "./itunes";
import {
  type Candidate,
  cleanTitle,
  searchTitle,
  decide,
  type Decision,
  failedCriteria,
  firstArtist,
  rules,
} from "./rules";

export type Label = { releaseGroupIds: string[]; source: string };

export type MatchResult = {
  index: number;
  input: string;
  sample?: string;
  /** Whether step 2 (the URL lookup) already knows the link. */
  knownByUrl: boolean;
  truth?: Label;
  hints?: { storefront: string; date: string; trackCount: number; decorated: boolean };
  candidates: number;
  /** Whether the title-and-artist search found nothing, so a title-only search ran. */
  fallbackSearch?: boolean;
  /** Whether any release of the right album came back from the search at all. */
  rightAlbumFound?: boolean;
  /** Names, from MusicBrainz, of the albums the search found. */
  albumTitles: Record<string, string>;
  decisions: Record<string, Decision & { correct?: boolean }>;
  failed?: ReturnType<typeof failedCriteria>;
  error?: string;
};

const relation = z.object({
  "target-type": z.string(),
  release: z.object({ id: z.string() }).optional(),
});
const urlEntry = z.object({ resource: z.string(), relations: z.array(relation).optional() });
const urlLookup = z.union([z.object({ urls: z.array(urlEntry) }), urlEntry]);
const releaseLookup = z.object({ "release-group": z.object({ id: z.string() }) });
const search = z.object({
  releases: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        date: z.string().optional(),
        "track-count": z.number().optional(),
        "artist-credit": z
          .array(
            z.object({
              name: z.string(),
              joinphrase: z.string().optional(),
              artist: z.object({ name: z.string(), "sort-name": z.string().optional() }).optional(),
            }),
          )
          .optional(),
        "release-group": z.object({ id: z.string(), title: z.string() }),
      }),
    )
    .default([]),
});
const groupSearch = z.object({
  "release-groups": z
    .array(z.object({ id: z.string(), "first-release-date": z.string().optional() }))
    .default([]),
});

/** A Lucene phrase: only quotes and backslashes need escaping inside one. */
const phrase = (text: string) => `"${text.replaceAll(/["\\]/g, (c) => `\\${c}`)}"`;

export async function matchLink(
  index: number,
  input: string,
  labels: Readonly<Record<string, Label>>,
  mb: MusicBrainz,
  itunes: Itunes,
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
  if (!parsed.ok || !parsed.link.albumId)
    return { ...result, error: parsed.ok ? "no album id" : parsed.reason };
  const { link } = parsed;
  const albumId = link.albumId ?? "";

  // The truth: the label, or the album of the release MusicBrainz links this URL to.
  const forms = urlCandidates(link);
  const lookup = urlLookup.parse(
    (await mb.get("url", {
      resource: forms ? [forms.canonical, ...forms.variants] : [],
      inc: "release-rels",
    })) ?? {
      urls: [],
    },
  );
  const linked = ("urls" in lookup ? lookup.urls : [lookup])
    .flatMap((url) => url.relations ?? [])
    .flatMap((r) => (r["target-type"] === "release" && r.release ? [r.release.id] : []));
  result.knownByUrl = linked.length > 0;
  const label = labels[input];
  if (label) result.truth = label;
  else if (linked[0]) {
    const release = releaseLookup.parse(
      await mb.get(`release/${linked[0]}`, { inc: "release-groups" }),
    );
    result.truth = {
      releaseGroupIds: [release["release-group"].id],
      source: "MusicBrainz URL relationship",
    };
  }

  const hints = await itunes.hints(albumId, [...new Set([link.storefront ?? "us", "us", "gb"])]);
  if (!hints)
    return { ...result, error: "iTunes Lookup has no such album in the storefronts tried" };
  result.hints = {
    storefront: hints.storefront,
    date: hints.date,
    trackCount: hints.trackCount,
    decorated: cleanTitle(hints.title) !== hints.title,
  };

  // One search wide enough for every rule: the clean title as a phrase also matches decorated titles. When the
  // artist as Apple spells it finds nothing, such as "Mumiy Troll" for Мумий Тролль, search by title alone.
  const title = phrase(searchTitle(hints.title));
  let found = search.parse(
    await mb.get("release", {
      query: `release:${title} AND artist:${phrase(firstArtist(hints.artist))}`,
      limit: "100",
    }),
  ).releases;
  if (found.length === 0) {
    result.fallbackSearch = true;
    found = search.parse(
      await mb.get("release", { query: `release:${title}`, limit: "100" }),
    ).releases;
  }
  const groupIds = [...new Set(found.map((r) => r["release-group"].id))].slice(0, 50);
  const firstDates = new Map<string, string | undefined>();
  if (groupIds.length > 0) {
    const groups = groupSearch.parse(
      await mb.get("release-group", {
        query: groupIds.map((id) => `rgid:${id}`).join(" OR "),
        limit: "100",
      }),
    )["release-groups"];
    for (const group of groups) firstDates.set(group.id, group["first-release-date"]);
  }
  const candidates: Candidate[] = found.map((r) => ({
    id: r.id,
    title: r.title,
    artistCredit: (r["artist-credit"] ?? []).map((c) => c.name + (c.joinphrase ?? "")).join(""),
    date: r.date || undefined,
    trackCount: r["track-count"] ?? 0,
    releaseGroupId: r["release-group"].id,
    releaseGroupTitle: r["release-group"].title,
    firstReleaseDate: firstDates.get(r["release-group"].id) || undefined,
    artistNames: (r["artist-credit"] ?? []).flatMap((c) =>
      c.artist ? [c.name, c.artist.name, c.artist["sort-name"] ?? c.artist.name] : [c.name],
    ),
  }));
  result.candidates = candidates.length;
  for (const c of candidates) result.albumTitles[c.releaseGroupId] = c.releaseGroupTitle;

  const truthGroups = result.truth?.releaseGroupIds ?? [];
  for (const rule of rules) {
    const decision = decide(rule, hints, candidates);
    result.decisions[rule.name] = {
      ...decision,
      ...(result.truth &&
        decision.releaseGroupId && { correct: truthGroups.includes(decision.releaseGroupId) }),
    };
  }
  if (result.truth) {
    const right = candidates.filter((c) => truthGroups.includes(c.releaseGroupId));
    result.rightAlbumFound = right.length > 0;
    if (right.length > 0) result.failed = failedCriteria(hints, right);
  }
  return result;
}
