// Builds the TON-15 sample: every Spotify link in the G1 sample (TON-14), more Spotify albums from Wikidata, and
// Spotify track links from Wikidata. Album links are labelled with the MusicBrainz release group they belong to,
// from Wikidata's P436 or, for the creator's links, a manual MusicBrainz search. Links MusicBrainz already knows
// also get truth at run time, from step 2; a track link's truth is its parent album's (FR-02.3).
//
//   bun tooling/src/spikes/g1-spotify/sample.ts
//
// It writes tooling/fixtures/g1-spotify/links.txt and labels.json.

import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import { userAgent } from "../g1-musicbrainz/musicbrainz";

const root = path.resolve(import.meta.dir, "../../../fixtures");
const extraAlbums = 50;
const tracks = 30;

/**
 * The creator's links MusicBrainz doesn't link, labelled by searching MusicBrainz by hand on 19 October 2026.
 * Their 1990 *Tchaikovsky: The Nutcracker* names no performer on its public page, so it stays unlabelled.
 */
const manualLabels: Record<string, string> = {
  "https://open.spotify.com/album/719ELjvRzp0lHiLyAuAGj3?si=JX1ffmBxR_GaTRFVYKpU6Q":
    "da40e720-2097-3730-8a7f-0c2ddbff4a96",
};

export type Label = { releaseGroupIds: string[]; source: string };

const bindingsSchema = z.object({
  results: z.object({
    bindings: z.array(z.record(z.string(), z.object({ value: z.string() }))),
  }),
});

async function sparql(query: string) {
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/sparql-results+json" },
  });
  if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
  return bindingsSchema.parse(await response.json()).results.bindings;
}

const entity = (iri: string) => iri.replace("http://www.wikidata.org/entity/", "");
const rank = (item: string) => createHash("md5").update(`tonaris-g1-spotify:${item}`).digest("hex");
const byRank = (a: string, b: string) => (rank(a) < rank(b) ? -1 : 1);

// The Spotify links of the G1 sample, by sample, with their Wikidata items.
type Line = { sample: string; link: string; item?: string };
const lines: Line[] = [];
let sample = "";
for (const raw of (await Bun.file(path.join(root, "g1-sample/links.txt")).text()).split("\n")) {
  const marker = /^#\s*sample:\s*(\S+)/.exec(raw.trim());
  if (marker?.[1]) sample = marker[1];
  const [link, comment] = raw.split(/\s#\s*/);
  if (link?.startsWith("https://open.spotify.com/")) {
    lines.push({ sample, link: link.trim(), ...(comment && { item: comment.trim() }) });
  }
}

const labels: Record<string, Label> = {};
for (const [link, id] of Object.entries(manualLabels)) {
  labels[link] = { releaseGroupIds: [id], source: "manual MusicBrainz search, 19 October 2026" };
}

// Release groups of the Wikidata items already in the sample.
const items = [...new Set(lines.flatMap((l) => (l.item ? [l.item] : [])))];
const known = await sparql(`SELECT ?item ?rg WHERE {
  VALUES ?item { ${items.map((item) => `wd:${item}`).join(" ")} }
  ?item wdt:P436 ?rg.
}`);
const groupsOf = Map.groupBy(known, (b) => entity(b.item?.value ?? ""));
for (const line of lines) {
  const groups = line.item ? groupsOf.get(line.item) : undefined;
  if (line.item && groups) {
    labels[line.link] = {
      releaseGroupIds: groups.flatMap((b) => (b.rg ? [b.rg.value] : [])),
      source: `Wikidata ${line.item} P436`,
    };
  }
}

// More labelled Spotify albums: another sixteenth of Wikidata's albums than the G1 sample used.
const extra = await sparql(`SELECT ?item ?id ?rg WHERE {
  ?item wdt:P31 wd:Q482994; wdt:P2205 ?id; wdt:P436 ?rg.
  FILTER(STRSTARTS(MD5(STR(?item)), "1"))
} LIMIT 1000`);
const byItem = Map.groupBy(extra, (b) => entity(b.item?.value ?? ""));
const picked = [...byItem.keys()]
  .filter((item) => !items.includes(item))
  .toSorted(byRank)
  .slice(0, extraAlbums);
for (const item of picked) {
  const bindings = byItem.get(item) ?? [];
  const spotifyId = bindings.map((b) => b.id?.value ?? "").toSorted()[0];
  if (!spotifyId) continue;
  const link = `https://open.spotify.com/album/${spotifyId}`;
  lines.push({ sample: "wikidata-spotify-extra", link, item });
  labels[link] = {
    releaseGroupIds: [...new Set(bindings.flatMap((b) => (b.rg ? [b.rg.value] : [])))],
    source: `Wikidata ${item} P436`,
  };
}

// Track links: Wikidata items with a Spotify track id (P2207), mostly songs and singles. They have no label: what
// a track link should identify is the album of the release it belongs to (FR-02.3), which only Spotify knows.
const trackBindings = await sparql(`SELECT ?item ?id WHERE {
  ?item wdt:P2207 ?id.
  FILTER(STRSTARTS(MD5(STR(?item)), "0"))
} LIMIT 1000`);
const trackOf = new Map(
  trackBindings.map((b) => [entity(b.item?.value ?? ""), b.id?.value ?? ""] as const),
);
for (const item of [...trackOf.keys()].toSorted(byRank).slice(0, tracks)) {
  lines.push({
    sample: "wikidata-spotify-tracks",
    link: `https://open.spotify.com/track/${trackOf.get(item)}`,
    item,
  });
}

const output = [
  "# The TON-15 sample: the G1 sample's Spotify links (tooling/fixtures/g1-sample) plus 'wikidata-spotify-extra'",
  "# albums and 'wikidata-spotify-tracks', drawn by tooling/src/spikes/g1-spotify/sample.ts. labels.json names each",
  "# labelled link's MusicBrainz release group.",
  "#   bun tooling/src/spikes/g1-spotify/run.ts tooling/fixtures/g1-spotify/links.txt",
];
let current = "";
for (const line of lines) {
  if (line.sample !== current) output.push("", `# sample: ${(current = line.sample)}`);
  output.push(line.item ? `${line.link} # ${line.item}` : line.link);
}
await Bun.write(path.join(root, "g1-spotify/links.txt"), `${output.join("\n")}\n`);
await Bun.write(path.join(root, "g1-spotify/labels.json"), `${JSON.stringify(labels, null, 2)}\n`);
console.log(`${lines.length} links, ${Object.keys(labels).length} labelled`);
