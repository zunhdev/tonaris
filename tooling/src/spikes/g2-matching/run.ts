// Runs the TON-18 evaluation over corpus.json, which build.ts writes:
// 1. same-title pairs, under TS-44's release-group rule and under title-and-artist similarity;
// 2. step 2: edition links MusicBrainz relates to releases of more than one album;
// 3. steps 3 and 4: edition links identified without the URL lookup, through Spotify's UPC (TON-15), a numeric
//    Qobuz id (TON-14) or Apple's hints (TON-16), against the album the link belongs to;
// 4. track links: where TON-15's Spotify track links landed.
//
//   bun tooling/src/spikes/g2-matching/run.ts [--rescore]
//
// It writes results.json and report.md in tooling/fixtures/g2-matching. It needs the Spotify credentials in the
// repository root's .env. Nothing is cached: the Spotify bridge's lookups carry UPCs (TS-41). `--rescore` keeps
// the previous run's lookups and identifications and scores them again, after verdicts.ts or corpus.json change.
// Either way, a link that seems to find the wrong album is checked for a release group MusicBrainz merged since.

import path from "node:path";
import { parseArgs } from "node:util";

import { z } from "zod";

import { Itunes } from "../g1-apple-hints/itunes";
import { matchLink } from "../g1-apple-hints/match";
import { recommended } from "../g1-apple-hints/rules";
import { parseLink } from "../g1-musicbrainz/links";
import { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import { barcodeForms, bridgeLink } from "../g1-spotify/bridge";
import { spotifyFromEnv } from "../g1-spotify/spotify";
import { type Edition, pairKey, type ReleaseGroup } from "./corpus";
import { classify, type Outcome, type Pair, selectLinks, scorePairs, truthOf } from "./evaluate";
import { buildReport } from "./report";
import { verdicts } from "./verdicts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { rescore: { type: "boolean", default: false } },
});

const fixtures = path.resolve(import.meta.dir, "../../../fixtures");
const dir = path.join(fixtures, "g2-matching");

type Corpus = {
  base: string[];
  missing: string[];
  artists: Record<string, { name: string; groups?: number; skipped?: string }>;
  releaseGroups: Record<string, ReleaseGroup & { artistId: string }>;
  editions: Edition[];
  sameTitle: { artistId: string; artist: string; key: string; members: string[]; pairs: Pair[] }[];
};
const corpus: Corpus = await Bun.file(path.join(dir, "corpus.json")).json();

export type Identified = {
  link: string;
  service: string;
  releaseGroupId: string;
  kinds: string[];
  outcome: Outcome;
  /** The albums found, with MusicBrainz's titles. */
  found: Record<string, string>;
  note?: string;
};
type Step2 = { link: string; albums: string[] }[];

// 1. Same-title pairs.
const truths = corpus.sameTitle.flatMap((g) => g.pairs.map((p) => truthOf(p, verdicts)));
const pairKeys = new Set(truths.map((t) => pairKey(t.a, t.b)));
for (const key of Object.keys(verdicts)) {
  if (!pairKeys.has(key)) console.error(`verdicts.ts names a pair the corpus doesn't have: ${key}`);
}
const sameAlbum = new Set(truths.filter((t) => t.same).map((t) => pairKey(t.a, t.b)));
const isSameAlbum = (a: string, b: string) => sameAlbum.has(pairKey(a, b));

const mb = new MusicBrainz({ minIntervalMs: 1_100, maxRetries: 8 });

/** 2. Step 2: which albums MusicBrainz relates each edition link to. */
async function lookUpLinks(): Promise<Step2> {
  const albumOfRelease = new Map(corpus.editions.map((e) => [e.releaseId, e.releaseGroupId]));
  const allLinks = [...new Set(corpus.editions.flatMap((e) => e.links))];
  const releasesOfLink = new Map<string, string[]>();
  const urlSchema = z.object({
    resource: z.string(),
    relations: z
      .array(
        z.object({ "target-type": z.string(), release: z.object({ id: z.string() }).optional() }),
      )
      .optional(),
  });
  const lookupSchema = z.union([z.object({ urls: z.array(urlSchema) }), urlSchema]);
  console.error(`Step 2: looking up ${allLinks.length} edition links…`);
  for (let i = 0; i < allLinks.length; i += 40) {
    // oxlint-disable-next-line no-await-in-loop
    const body = await mb.get("url", { resource: allLinks.slice(i, i + 40), inc: "release-rels" });
    const lookup = body === null ? { urls: [] } : lookupSchema.parse(body);
    for (const url of "urls" in lookup ? lookup.urls : [lookup]) {
      releasesOfLink.set(
        url.resource,
        (url.relations ?? []).flatMap((r) =>
          r["target-type"] === "release" && r.release ? [r.release.id] : [],
        ),
      );
    }
  }
  const unknown = [...new Set([...releasesOfLink.values()].flat())].filter(
    (id) => !albumOfRelease.has(id),
  );
  const reidSchema = z.object({
    releases: z
      .array(z.object({ id: z.string(), "release-group": z.object({ id: z.string() }) }))
      .default([]),
  });
  for (let i = 0; i < unknown.length; i += 40) {
    const { releases } = reidSchema.parse(
      // oxlint-disable-next-line no-await-in-loop
      await mb.get("release", {
        query: unknown
          .slice(i, i + 40)
          .map((id) => `reid:${id}`)
          .join(" OR "),
        limit: "100",
      }),
    );
    for (const r of releases) albumOfRelease.set(r.id, r["release-group"].id);
  }
  return [...releasesOfLink].map(([link, releases]) => ({
    link,
    albums: [...new Set(releases.flatMap((id) => albumOfRelease.get(id) ?? []))],
  }));
}

const serviceOf = (link: string) => {
  const parsed = parseLink(link);
  return parsed.ok ? parsed.link.service : undefined;
};

/** 3. Steps 3 and 4: the selected edition links, identified without the URL lookup. */
async function identifyEditions(): Promise<Identified[]> {
  const selected = selectLinks(corpus.editions, serviceOf, 2, {
    spotify: 80,
    "apple-music": 60,
    qobuz: 40,
    tidal: 0,
    "youtube-music": 0,
  });
  const spotify = spotifyFromEnv();
  const itunes = new Itunes();
  const barcodeSchema = z.object({
    releases: z
      .array(
        z.object({
          barcode: z.string().nullish(),
          "release-group": z.object({ id: z.string(), title: z.string() }),
        }),
      )
      .default([]),
  });
  const identified: Identified[] = [];
  console.error(`Steps 3 and 4: identifying ${selected.length} edition links…`);
  for (const [index, s] of selected.entries()) {
    const result: Identified = { ...s, outcome: "none", found: {} };
    try {
      if (s.service === "spotify") {
        // oxlint-disable-next-line no-await-in-loop
        const r = await bridgeLink(index, s.link, {}, mb, spotify);
        const albums = r.step3?.releaseGroupIds ?? [];
        for (const id of albums) result.found[id] = r.albums[id]?.title ?? id;
        result.outcome = r.error ? "error" : classify(s.releaseGroupId, albums, isSameAlbum);
        if (r.error) result.note = r.error;
        else if (r.upc !== "present") result.note = `UPC: ${r.upc ?? "—"}`;
      } else if (s.service === "qobuz") {
        const parsed = parseLink(s.link);
        const id = parsed.ok ? parsed.link.id : "";
        const barcodes = /^\d{12,13}$/.test(id) ? barcodeForms(id) : [];
        if (barcodes.length === 0) {
          result.outcome = "no bridge";
        } else {
          const releases = barcodeSchema
            .parse(
              // oxlint-disable-next-line no-await-in-loop
              await mb.get("release", {
                query: barcodes.map((b) => `barcode:${b}`).join(" OR "),
                limit: "100",
              }),
            )
            .releases.filter((r) => r.barcode && barcodes.includes(r.barcode));
          for (const r of releases) result.found[r["release-group"].id] = r["release-group"].title;
          result.outcome = classify(s.releaseGroupId, Object.keys(result.found), isSameAlbum);
        }
      } else {
        const labels = { [s.link]: { releaseGroupIds: [s.releaseGroupId], source: "corpus" } };
        // oxlint-disable-next-line no-await-in-loop
        const r = await matchLink(index, s.link, labels, mb, itunes);
        const decision = r.decisions[recommended];
        result.found = r.albumTitles;
        if (r.error) {
          result.outcome = "none";
          result.note = r.error;
        } else if (decision?.outcome === "accepted" && decision.releaseGroupId) {
          result.found = {
            [decision.releaseGroupId]: r.albumTitles[decision.releaseGroupId] ?? "",
          };
          result.outcome = classify(s.releaseGroupId, [decision.releaseGroupId], isSameAlbum);
        } else {
          result.outcome = decision?.outcome === "ambiguous" ? "several" : "none";
        }
      }
    } catch (error) {
      result.outcome = "error";
      // MusicBrainz errors name the request URL, whose query may carry a UPC.
      result.note = (error instanceof Error ? error.message : String(error)).replaceAll(
        /(https?:\/\/[^\s?]+)\?\S*/g,
        "$1?…",
      );
    }
    identified.push(result);
    console.error(
      `[${index + 1}/${selected.length}] ${s.service} ${s.kinds.join("+")}: ${result.outcome}`,
    );
  }
  return identified;
}

type Previous = { step2: Step2; identified: Identified[] };
const previous: Previous | undefined = values.rescore
  ? await Bun.file(path.join(dir, "results.json")).json()
  : undefined;
const step2 = previous?.step2 ?? (await lookUpLinks());
const identified = previous?.identified ?? (await identifyEditions());

// A single album found is scored again against the current verdicts; several, none and errors stand.
for (const r of identified) {
  if (["right", "split", "wrong"].includes(r.outcome)) {
    r.outcome = classify(r.releaseGroupId, Object.keys(r.found), isSameAlbum);
  }
}

// A wrong album may be the right one under a newer id: MusicBrainz answers a lookup of a merged release group
// with the group it was merged into.
const canonical = new Map<string, string | null>();
for (const r of identified.filter((i) => i.outcome === "wrong")) {
  if (!canonical.has(r.releaseGroupId)) {
    // oxlint-disable-next-line no-await-in-loop
    const body = await mb.get(`release-group/${r.releaseGroupId}`, {});
    canonical.set(
      r.releaseGroupId,
      body === null ? null : z.object({ id: z.string() }).parse(body).id,
    );
  }
  const current = canonical.get(r.releaseGroupId);
  const [found] = Object.keys(r.found);
  if (current && current !== r.releaseGroupId && found) {
    r.note = `MusicBrainz merged ${r.releaseGroupId} into ${current}`;
    r.outcome = classify(current, [found], isSameAlbum);
  }
}

// 4. Track links, from TON-15.
const ton15 = z
  .object({
    results: z.array(
      z.object({
        input: z.string(),
        kind: z.string().optional(),
        chain: z.object({ outcome: z.string(), releaseGroupId: z.string().optional() }).optional(),
        albums: z.record(
          z.string(),
          z.object({
            title: z.string(),
            primaryType: z.string().nullable(),
            secondaryTypes: z.array(z.string()),
          }),
        ),
      }),
    ),
  })
  .parse(await Bun.file(path.join(fixtures, "g1-spotify/results.json")).json());
const tracks = ton15.results
  .filter((r) => r.kind === "track")
  .map((r) => {
    const album = r.chain?.releaseGroupId ? r.albums[r.chain.releaseGroupId] : undefined;
    const track: { link: string; outcome: string; album?: (typeof r.albums)[string] } = {
      link: r.input,
      outcome: r.chain?.outcome ?? "none",
    };
    if (album) track.album = album;
    return track;
  });

const results = { pairs: { truths, score: scorePairs(truths) }, step2, identified, tracks };
await Bun.write(path.join(dir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
await Bun.write(path.join(dir, "report.md"), buildReport(corpus, results));
console.error(`Wrote results.json and report.md in ${dir}`);
