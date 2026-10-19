// One Spotify link through the TON-15 measurement: TS-41 step 2 (MusicBrainz URL lookup) and step 3 (Spotify's
// identifier bridge: Get Track for a track link's parent album, Get Album for its UPC, then a MusicBrainz barcode
// search). Step 3 runs even when step 2 already knows the album, so the bridge's hit rate and its agreement with
// step 2 can both be measured. Outcomes are scored on the album, the MusicBrainz release group (FR-02.12).
//
// Spotify values stay in memory (TS-41): the result says whether a UPC or a parent album was found and how long
// the UPC is, never what it is, and MusicBrainz requests that would carry it aren't recorded with their URLs.

import { z } from "zod";

import { urlCandidates } from "../g1-musicbrainz/chain";
import { parseLink } from "../g1-musicbrainz/links";
import type { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import type { Spotify } from "./spotify";

export type Label = { releaseGroupIds: string[]; source: string };

/** One album → confident; several albums → the person chooses (TS-26); none → the next step. */
export type Step = {
  outcome: "confident" | "needs_input" | "none";
  releaseGroupIds: string[];
  releases: number;
};

export type Album = { title: string; primaryType: string | null; secondaryTypes: string[] };

export type BridgeResult = {
  index: number;
  input: string;
  sample?: string;
  kind?: "album" | "track";
  truth?: Label;
  /** Track links: whether Get Track named the album the link belongs to. */
  parentFound?: boolean;
  step2?: Step;
  /** What Get Album gave: a UPC, an album without one, or no album (404). */
  upc?: "present" | "missing" | "no-album";
  upcDigits?: number;
  step3?: Step;
  /** Steps 2 and 3 in TS-41's order. */
  chain?: { outcome: Step["outcome"]; step?: 2 | 3; releaseGroupId?: string; correct?: boolean };
  /** Step 3 on its own against the truth, when it found one album. */
  step3Correct?: boolean;
  /** When steps 2 and 3 both found one album: whether it's the same one. */
  agrees?: boolean;
  /** MusicBrainz's names and types (CC0) of every album either step found. */
  albums: Record<string, Album>;
  /** Why step 3 missed an album MusicBrainz has: what the right album's releases carry. */
  miss?: { releases: number; withBarcode: number; digital: number; barcodeFormsMissed: boolean };
  spotify: { calls: number; ms: number };
  musicbrainz: number;
  error?: string;
};

const releaseGroup = z.object({
  id: z.string(),
  title: z.string(),
  "primary-type": z.string().nullish(),
  "secondary-types": z.array(z.string()).optional(),
});
const searchSchema = z.object({
  releases: z
    .array(
      z.object({ id: z.string(), barcode: z.string().nullish(), "release-group": releaseGroup }),
    )
    .default([]),
});
const browseSchema = z.object({
  releases: z
    .array(
      z.object({
        barcode: z.string().nullish(),
        media: z.array(z.object({ format: z.string().nullish() })).optional(),
      }),
    )
    .default([]),
});
const relation = z.object({
  "target-type": z.string(),
  release: z.object({ id: z.string() }).optional(),
});
const urlEntry = z.object({ resource: z.string(), relations: z.array(relation).optional() });
const urlLookup = z.union([z.object({ urls: z.array(urlEntry) }), urlEntry]);

/** Digits without the leading zeros that tell UPC-A, EAN-13 and GTIN-14 apart. */
const core = (code: string) => code.replace(/^0+/, "");

/**
 * The forms a Spotify UPC may be stored under in MusicBrainz, which keeps barcodes as entered: Spotify gives one
 * UPC-A as 12 digits, as a 13-digit EAN with a leading 0, or as a 14-digit GTIN with two, and editors importing
 * from Spotify copy the GTIN as it is.
 */
export function barcodeForms(upc: string): string[] {
  if (!/^\d+$/.test(upc)) return [];
  const digits = core(upc);
  return [12, 13, 14].filter((n) => digits.length <= n).map((n) => digits.padStart(n, "0"));
}

export function decide(groups: readonly string[], releases: number): Step {
  const releaseGroupIds = [...new Set(groups)];
  const outcome =
    releaseGroupIds.length === 1
      ? "confident"
      : releaseGroupIds.length > 1
        ? "needs_input"
        : "none";
  return { outcome, releaseGroupIds, releases };
}

export async function bridgeLink(
  index: number,
  input: string,
  labels: Readonly<Record<string, Label>>,
  mb: MusicBrainz,
  spotify: Spotify,
): Promise<BridgeResult> {
  const result: BridgeResult = {
    index,
    input,
    albums: {},
    spotify: { calls: 0, ms: 0 },
    musicbrainz: 0,
  };
  const spotifyBefore = spotify.requests.length;
  const mbBefore = mb.requests.length;
  try {
    await measure(result);
  } catch (error) {
    // MusicBrainz errors name the request URL, whose query may carry the UPC or the parent album's URL.
    result.error = (error instanceof Error ? error.message : String(error)).replaceAll(
      /(https?:\/\/[^\s?]+)\?\S*/g,
      "$1?…",
    );
  }
  const calls = spotify.requests.slice(spotifyBefore);
  result.spotify = { calls: calls.length, ms: Math.round(calls.reduce((sum, r) => sum + r.ms, 0)) };
  result.musicbrainz = mb.requests.length - mbBefore;
  return result;

  async function measure(r: BridgeResult) {
    const parsed = parseLink(input);
    if (!parsed.ok || parsed.link.service !== "spotify") {
      r.error = parsed.ok ? "not a Spotify link" : parsed.reason;
      return;
    }
    const { link } = parsed;
    r.kind = link.kind;
    const label = labels[input];
    if (label) r.truth = label;

    // A track link names no album: Get Track gives the one it belongs to, then steps 2 and 3 run on that album.
    let albumId = link.albumId;
    if (link.kind === "track") {
      albumId = await spotify.parentAlbum(link.id);
      r.parentFound = albumId !== undefined;
      if (!albumId) return;
    }
    if (!albumId) return;
    const albumLink = parseLink(`https://open.spotify.com/album/${albumId}`);
    if (!albumLink.ok) return;

    // Step 2: does MusicBrainz link this album URL to releases, and of which albums?
    const forms = urlCandidates(albumLink.link);
    const lookup = urlLookup.parse(
      (await mb.get("url", {
        resource: forms ? [forms.canonical, ...forms.variants] : [],
        inc: "release-rels",
      })) ?? { urls: [] },
    );
    const linked = [
      ...new Set(
        ("urls" in lookup ? lookup.urls : [lookup])
          .flatMap((url) => url.relations ?? [])
          .flatMap((rel) =>
            rel["target-type"] === "release" && rel.release ? [rel.release.id] : [],
          ),
      ),
    ];
    const step2Releases =
      linked.length === 0
        ? []
        : searchSchema.parse(
            await mb.get("release", {
              query: linked.map((id) => `reid:${id}`).join(" OR "),
              limit: "100",
            }),
          ).releases;
    remember(step2Releases);
    r.step2 = decide(
      step2Releases.map((release) => release["release-group"].id),
      linked.length,
    );
    const [step2Album] = r.step2.releaseGroupIds;
    if (!r.truth && r.step2.outcome === "confident" && step2Album) {
      r.truth = { releaseGroupIds: [step2Album], source: "MusicBrainz URL relationship" };
    }

    // Step 3: the UPC from Get Album, searched in every form MusicBrainz may keep it in.
    const ids = await spotify.album(albumId);
    r.upc = ids === undefined ? "no-album" : ids.upc ? "present" : "missing";
    if (ids?.upc) {
      r.upcDigits = ids.upc.length;
      const barcodes = barcodeForms(ids.upc);
      const found = searchSchema
        .parse(
          await mb.get("release", {
            query: barcodes.map((barcode) => `barcode:${barcode}`).join(" OR "),
            limit: "100",
          }),
        )
        .releases.filter((release) => release.barcode && barcodes.includes(release.barcode));
      remember(found);
      r.step3 = decide(
        found.map((release) => release["release-group"].id),
        found.length,
      );

      // A miss on an album MusicBrainz has: are its releases without barcodes, or only physical?
      const [truthAlbum] = r.truth?.releaseGroupIds ?? [];
      if (r.step3.outcome === "none" && truthAlbum) {
        const releases = browseSchema.parse(
          await mb.get("release", { "release-group": truthAlbum, inc: "media", limit: "100" }),
        ).releases;
        r.miss = {
          releases: releases.length,
          withBarcode: releases.filter((release) => release.barcode).length,
          digital: releases.filter((release) =>
            (release.media ?? []).some((medium) => medium.format === "Digital Media"),
          ).length,
          barcodeFormsMissed: releases.some(
            (release) => release.barcode && core(release.barcode) === core(ids.upc ?? ""),
          ),
        };
      }
    }

    const truth = r.truth?.releaseGroupIds;
    const [step3Album] = r.step3?.releaseGroupIds ?? [];
    if (truth && r.step3?.outcome === "confident" && step3Album) {
      r.step3Correct = truth.includes(step3Album);
    }
    if (r.step2.outcome === "confident" && r.step3?.outcome === "confident") {
      r.agrees = step2Album === step3Album;
    }
    const decided = r.step2.outcome === "none" ? r.step3 : r.step2;
    const [chosen] = decided?.releaseGroupIds ?? [];
    r.chain = {
      outcome: decided?.outcome ?? "none",
      ...(decided?.outcome !== "none" && { step: decided === r.step2 ? 2 : 3 }),
      ...(decided?.outcome === "confident" &&
        chosen && {
          releaseGroupId: chosen,
          ...(truth && { correct: truth.includes(chosen) }),
        }),
    };
  }

  function remember(releases: z.infer<typeof searchSchema>["releases"]) {
    for (const { "release-group": group } of releases) {
      result.albums[group.id] = {
        title: group.title,
        primaryType: group["primary-type"] ?? null,
        secondaryTypes: group["secondary-types"] ?? [],
      };
    }
  }
}
