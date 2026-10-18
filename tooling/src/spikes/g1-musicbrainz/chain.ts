// The first steps of the TS-41 resolver chain, run over a batch of links for the G1 spike:
// 0 parse, 1 existing link, 2 MusicBrainz URL lookup, 3 the Qobuz barcode bridge. Spotify's bridge (TON-15) and
// Apple's hints (TON-16) are other spikes, so those links stop as "pending" here. Every identified release is
// then looked up once to measure what enrichment would get: TS-45 classification, the original year, Cover Art
// Archive artwork and TS-46 recording dates.

import { z } from "zod";

import { type Fetcher, parseLink, type ParsedLink, resolveShortLink, type Service } from "./links";
import type { MusicBrainz } from "./musicbrainz";

export type Outcome =
  | "existing"
  | "confident"
  | "needs_input"
  | "pending"
  | "unresolved"
  | "unsupported";

export type Attempt = {
  step: 2 | 3;
  /** The URLs or barcodes asked about. */
  tried: string[];
  /** The ones MusicBrainz knew. */
  matched: string[];
  releaseIds: string[];
  /** What tells the releases apart, when there are several: input for G2 (TON-18). */
  candidates?: Candidate[];
  /** URL entries MusicBrainz knows but relates to no release (say, only to an artist). */
  withoutRelease?: number;
  releaseGroups?: number;
};

export type Candidate = {
  id: string;
  title?: string;
  barcode?: string | null;
  date?: string;
  country?: string | null;
  releaseGroupId?: string | undefined;
};

export type RecordingDates = {
  recordings: number;
  /** Recordings with a dated "recorded at" or "recorded in" relationship (TS-46). */
  withRelationshipDates: number;
  /** Recordings dated only through the event they were recorded at. */
  withEventDatesOnly: number;
  span: [string, string] | null;
};

export type ReleaseFacts = {
  title: string;
  artistCredit: string;
  barcode: string | null;
  releaseGroupId: string | null;
  primaryType: string | null;
  secondaryTypes: string[];
  firstReleaseDate: string | null;
  releaseType: "album" | "ep" | "compilation" | null;
  isLive: boolean;
  coverFront: boolean;
  /** Checked only when the release has no front: whether the release group's front would do. */
  releaseGroupCover?: boolean;
  recordingDates: RecordingDates;
};

export type LinkResult = {
  index: number;
  input: string;
  shortLink?: boolean;
  link?: ParsedLink;
  outcome: Outcome;
  /** The step that decided the outcome. */
  step?: 0 | 1 | 2 | 3;
  reason?: string;
  releaseId?: string;
  candidates?: string[];
  /** For `existing`: the earlier link it repeats. */
  sameAs?: number;
  attempts: Attempt[];
  release?: ReleaseFacts;
  /** Milliseconds since the batch started. */
  identifiedAtMs: number;
  enrichedAtMs?: number;
  requests: number;
};

// MusicBrainz's JSON, as far as the spike reads it.
const relationSchema = z.object({
  type: z.string(),
  "target-type": z.string(),
  begin: z.string().nullish(),
  end: z.string().nullish(),
  release: z
    .object({
      id: z.string(),
      title: z.string().optional(),
      barcode: z.string().nullish(),
      date: z.string().optional(),
      country: z.string().nullish(),
    })
    .optional(),
  event: z
    .object({
      "life-span": z.object({ begin: z.string().nullish(), end: z.string().nullish() }).optional(),
    })
    .optional(),
});
const urlSchema = z.object({ resource: z.string(), relations: z.array(relationSchema).optional() });
/** One URL answers with the entry itself, several with a list of the ones MusicBrainz knows. */
const urlLookupSchema = z.union([z.object({ urls: z.array(urlSchema) }), urlSchema]);
const releaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  barcode: z.string().nullish(),
  "artist-credit": z
    .array(z.object({ name: z.string(), joinphrase: z.string().optional() }))
    .optional(),
  "release-group": z
    .object({
      id: z.string(),
      "primary-type": z.string().nullish(),
      "secondary-types": z.array(z.string()).optional(),
      "first-release-date": z.string().optional(),
    })
    .optional(),
  "cover-art-archive": z.object({ front: z.boolean() }).optional(),
  media: z
    .array(
      z.object({
        tracks: z
          .array(
            z.object({ recording: z.object({ relations: z.array(relationSchema).optional() }) }),
          )
          .optional(),
      }),
    )
    .optional(),
});
const releaseSearchSchema = z.object({ releases: z.array(releaseSchema).default([]) });
type MbRelease = z.infer<typeof releaseSchema>;

/** Storefronts tried besides the link's own: MusicBrainz keeps the storefront its editor pasted. */
const appleStorefronts = ["us", "gb", "de", "fr", "jp", "ca", "au", "nl", "se", "it", "es"];

const unique = (items: readonly (string | false | undefined)[]) => [
  ...new Set(items.filter((item): item is string => Boolean(item))),
];

const urlForms: Record<Service, (link: ParsedLink, albumId: string) => string[]> = {
  spotify: (_, albumId) => [`https://open.spotify.com/album/${albumId}`],
  "apple-music": (link, albumId) =>
    unique([link.storefront, ...appleStorefronts]).map(
      (storefront) => `https://music.apple.com/${storefront}/album/${albumId}`,
    ),
  qobuz: (link, albumId) =>
    unique([
      `https://open.qobuz.com/album/${albumId}`,
      link.slug && `https://www.qobuz.com/album/${link.slug}/${albumId}`,
      link.locale &&
        link.slug &&
        `https://www.qobuz.com/${link.locale}/album/${link.slug}/${albumId}`,
      `https://play.qobuz.com/album/${albumId}`,
    ]),
};

/** The forms MusicBrainz may store this album's URL in. Spotify and Qobuz track links name no album. */
export function urlCandidates(link: ParsedLink): string[] {
  return link.albumId ? urlForms[link.service](link, link.albumId) : [];
}

/** A 13-digit Qobuz album id is an EAN-13 (TS-41). MusicBrainz often stores a UPC-A, without the leading 0. */
export function barcodeForms(link: ParsedLink): string[] {
  if (link.service !== "qobuz" || !link.albumId || !/^\d{13}$/.test(link.albumId)) return [];
  return unique([link.albumId, link.albumId.startsWith("0") && link.albumId.slice(1)]);
}

/** TS-45: MusicBrainz types to the product's classification. */
export function classify(primaryType: string | null, secondaryTypes: readonly string[]) {
  const releaseType = secondaryTypes.includes("Compilation")
    ? "compilation"
    : primaryType === "Album"
      ? "album"
      : primaryType === "EP"
        ? "ep"
        : null;
  return { releaseType, isLive: secondaryTypes.includes("Live") } as const;
}

/** TS-46: the span of the recordings' dated relationships, falling back to the events they were recorded at. */
export function recordingDates(release: MbRelease): RecordingDates {
  const dates: string[] = [];
  let recordings = 0;
  let withRelationshipDates = 0;
  let withEventDatesOnly = 0;
  for (const medium of release.media ?? []) {
    for (const { recording } of medium.tracks ?? []) {
      recordings++;
      const relations = (recording.relations ?? []).filter((r) => r.type.startsWith("recorded "));
      const own = relations.flatMap((r) => [r.begin, r.end]).filter((d): d is string => Boolean(d));
      const events = relations
        .flatMap((r) => [r.event?.["life-span"]?.begin, r.event?.["life-span"]?.end])
        .filter((d): d is string => Boolean(d));
      if (own.length > 0) withRelationshipDates++;
      else if (events.length > 0) withEventDatesOnly++;
      dates.push(...(own.length > 0 ? own : events));
    }
  }
  const sorted = dates.toSorted();
  const first = sorted[0];
  const last = sorted.at(-1);
  return {
    recordings,
    withRelationshipDates,
    withEventDatesOnly,
    span: first && last ? [first, last] : null,
  };
}

function releaseFacts(release: MbRelease): ReleaseFacts {
  const group = release["release-group"];
  const primaryType = group?.["primary-type"] ?? null;
  const secondaryTypes = group?.["secondary-types"] ?? [];
  return {
    title: release.title,
    artistCredit: (release["artist-credit"] ?? [])
      .map((c) => c.name + (c.joinphrase ?? ""))
      .join(""),
    barcode: release.barcode || null,
    releaseGroupId: group?.id ?? null,
    primaryType,
    secondaryTypes,
    firstReleaseDate: group?.["first-release-date"] || null,
    ...classify(primaryType, secondaryTypes),
    coverFront: release["cover-art-archive"]?.front ?? false,
    recordingDates: recordingDates(release),
  };
}

/** One release is confident; several need the person to choose (TS-26); none passes to the next step. */
function decide(step: 2 | 3, releaseIds: readonly string[]) {
  const [only] = releaseIds;
  if (releaseIds.length === 1 && only)
    return { outcome: "confident" as const, step, releaseId: only };
  if (releaseIds.length > 1)
    return { outcome: "needs_input" as const, step, candidates: [...releaseIds] };
  return undefined;
}

const pendingReasons: Partial<Record<Service, string>> = {
  spotify: "needs the Spotify identifier bridge (TON-15)",
  "apple-music": "needs the iTunes Lookup hints (TON-16)",
};

export type ChainOptions = {
  /** For short links and the Cover Art Archive; MusicBrainz goes through `mb`. */
  fetch?: Fetcher;
  onResult?: (result: LinkResult) => void;
};

export async function runChain(
  inputs: readonly string[],
  mb: MusicBrainz,
  options: ChainOptions = {},
): Promise<LinkResult[]> {
  const fetcher = options.fetch ?? fetch;
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const seen = new Map<string, number>();
  const results: LinkResult[] = [];

  for (const [index, input] of inputs.entries()) {
    const requestsBefore = mb.requests.length;
    // Links run one after another through the shared 1 request/second queue, as capture jobs would.
    // oxlint-disable-next-line no-await-in-loop
    const result = await identify(index, input);
    if (result.outcome === "confident" && result.releaseId) {
      // oxlint-disable-next-line no-await-in-loop
      result.release = await enrich(result.releaseId);
      result.enrichedAtMs = elapsed();
    }
    result.requests = mb.requests.length - requestsBefore;
    results.push(result);
    options.onResult?.(result);
  }
  return results;

  async function identify(index: number, input: string): Promise<LinkResult> {
    const base = { index, input, attempts: [] as Attempt[], requests: 0 };
    let parsed = parseLink(input);
    let shortLink = false;
    if (!parsed.ok && parsed.shortLink) {
      shortLink = true;
      try {
        parsed = parseLink(await resolveShortLink(parsed.shortLink, fetcher));
      } catch (error) {
        parsed = {
          ok: false,
          reason: `short link: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    if (!parsed.ok) {
      return {
        ...base,
        shortLink,
        outcome: "unsupported",
        step: 0,
        reason: parsed.reason,
        identifiedAtMs: elapsed(),
      };
    }
    const { link } = parsed;
    const withLink = { ...base, ...(shortLink && { shortLink }), link };

    // Step 1: the owner's collection already links this album. In the spike, an earlier link in the batch.
    const key = `${link.service}:${link.albumId ? `album:${link.albumId}` : `${link.kind}:${link.id}`}`;
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      return {
        ...withLink,
        outcome: "existing",
        step: 1,
        sameAs: earlier,
        identifiedAtMs: elapsed(),
      };
    }
    seen.set(key, index);

    // Step 2: MusicBrainz URL lookup, every stored form in one request.
    const candidates = urlCandidates(link);
    if (candidates.length > 0) {
      const body = await mb.get("url", { resource: candidates, inc: "release-rels" });
      const lookup = body === null ? { urls: [] } : urlLookupSchema.parse(body);
      const urls = "urls" in lookup ? lookup.urls : [lookup];
      const linked = new Map(
        urls
          .flatMap((url) => url.relations ?? [])
          .flatMap((r) => (r["target-type"] === "release" && r.release ? [r.release] : []))
          .map((release) => [release.id, release]),
      );
      const releaseIds = [...linked.keys()];
      const attempt: Attempt = {
        step: 2,
        tried: candidates,
        matched: urls.map((url) => url.resource),
        releaseIds,
        ...(linked.size > 1 && { candidates: [...linked.values()] }),
        withoutRelease: urls.filter(
          (url) => !(url.relations ?? []).some((r) => r["target-type"] === "release"),
        ).length,
      };
      withLink.attempts.push(attempt);
      const decided = decide(2, releaseIds);
      if (decided) return { ...withLink, ...decided, identifiedAtMs: elapsed() };
    }

    // Step 3: the identifier bridge. Here only Qobuz's barcode ids; Spotify's is TON-15.
    const barcodes = barcodeForms(link);
    if (barcodes.length > 0) {
      const body = await mb.get("release", {
        query: barcodes.map((barcode) => `barcode:${barcode}`).join(" OR "),
        limit: "25",
      });
      const releases = (body === null ? [] : releaseSearchSchema.parse(body).releases).filter(
        (r) => r.barcode && barcodes.includes(r.barcode),
      );
      const releaseIds = unique(releases.map((r) => r.id));
      withLink.attempts.push({
        step: 3,
        tried: barcodes,
        matched: unique(releases.map((r) => r.barcode ?? undefined)),
        releaseIds,
        releaseGroups: unique(releases.map((r) => r["release-group"]?.id)).length,
        ...(releaseIds.length > 1 && {
          candidates: releases.map((r): Candidate => ({
            id: r.id,
            title: r.title,
            barcode: r.barcode,
            releaseGroupId: r["release-group"]?.id,
          })),
        }),
      });
      const decided = decide(3, releaseIds);
      if (decided) return { ...withLink, ...decided, identifiedAtMs: elapsed() };
    }

    const pending = pendingReasons[link.service];
    if (pending)
      return { ...withLink, outcome: "pending", reason: pending, identifiedAtMs: elapsed() };
    const reason =
      link.kind === "track"
        ? "a Qobuz track link names no album, and nothing bridges it"
        : barcodes.length > 0
          ? "neither the URL nor the barcode is in MusicBrainz"
          : "the URL isn't in MusicBrainz, and the id isn't a barcode";
    return { ...withLink, outcome: "unresolved", reason, identifiedAtMs: elapsed() };
  }

  async function enrich(releaseId: string): Promise<ReleaseFacts> {
    const release = releaseSchema.parse(
      await mb.get(`release/${releaseId}`, {
        inc: "release-groups artist-credits recordings recording-level-rels place-rels area-rels event-rels",
      }),
    );
    const facts = releaseFacts(release);
    if (!facts.coverFront && facts.releaseGroupId) {
      // The release group's front, if the product chose to fall back to it.
      const response = await fetcher(
        `https://coverartarchive.org/release-group/${facts.releaseGroupId}/front-500`,
        { method: "HEAD", redirect: "manual" },
      );
      facts.releaseGroupCover = response.status >= 300 && response.status < 400;
    }
    return facts;
  }
}
