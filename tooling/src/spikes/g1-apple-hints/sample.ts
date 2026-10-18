// Builds the TON-16 sample: every Apple Music link in the G1 sample (TON-14), plus more Apple albums from Wikidata,
// each labelled with the MusicBrainz release group it belongs to, so hint matches can be scored.
// Labels come from Wikidata's P436 (MusicBrainz release group ID) or, for the creator's links, from a manual
// MusicBrainz search. Links MusicBrainz already knows also get release-level truth at run time, from step 2.
//
//   bun tooling/src/spikes/g1-apple-hints/sample.ts
//
// It writes tooling/fixtures/g1-apple/links.txt and labels.json.

import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import { userAgent } from "../g1-musicbrainz/musicbrainz";

const root = path.resolve(import.meta.dir, "../../../fixtures");
const extraSize = 50;

/** The creator's links MusicBrainz doesn't link, labelled by searching MusicBrainz by hand on 19 October 2026. */
const manualLabels: Record<string, string> = {
  "https://music.apple.com/fi/album/bleach-deluxe-edition/669728060":
    "f1afec0b-26dd-3db5-9aa1-c91229a74a24",
  "https://music.apple.com/fi/album/%D0%B8%D0%BA%D1%80%D0%B0-deluxe/869027888":
    "54dc2ea4-d3da-319d-8ee9-c2f4faf98581",
  "https://music.apple.com/fi/album/ep2/679710399": "8ae9b2e3-5d6d-4390-b8e7-a7031e4eafb1",
  "https://music.apple.com/fi/album/tchaikovsky-the-nutcracker-remastered-2026/6809480000":
    "5fe75120-028e-4157-b6c6-322e86dcf89d",
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
const rank = (item: string) => createHash("md5").update(`tonaris-g1-apple:${item}`).digest("hex");

// The Apple links of the G1 sample, by sample, with their Wikidata items.
type Line = { sample: string; link: string; item?: string };
const lines: Line[] = [];
let sample = "";
for (const raw of (await Bun.file(path.join(root, "g1-sample/links.txt")).text()).split("\n")) {
  const marker = /^#\s*sample:\s*(\S+)/.exec(raw.trim());
  if (marker?.[1]) sample = marker[1];
  const [link, comment] = raw.split(/\s#\s*/);
  if (link?.startsWith("https://music.apple.com/")) {
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

// More labelled Apple albums: another sixteenth of Wikidata's albums than the G1 sample used.
const extra = await sparql(`SELECT ?item ?id ?rg WHERE {
  ?item wdt:P31 wd:Q482994; wdt:P2281 ?id; wdt:P436 ?rg.
  FILTER(STRSTARTS(MD5(STR(?item)), "1"))
} LIMIT 1000`);
const byItem = Map.groupBy(extra, (b) => entity(b.item?.value ?? ""));
const picked = [...byItem.keys()]
  .filter((item) => !items.includes(item))
  .toSorted((a, b) => (rank(a) < rank(b) ? -1 : 1))
  .slice(0, extraSize);
for (const item of picked) {
  const bindings = byItem.get(item) ?? [];
  const appleId = bindings.map((b) => b.id?.value ?? "").toSorted()[0];
  if (!appleId) continue;
  const link = `https://music.apple.com/us/album/${appleId}`;
  lines.push({ sample: "wikidata-apple-extra", link, item });
  labels[link] = {
    releaseGroupIds: [...new Set(bindings.flatMap((b) => (b.rg ? [b.rg.value] : [])))],
    source: `Wikidata ${item} P436`,
  };
}

const output = [
  "# The TON-16 sample: the G1 sample's Apple Music links (tooling/fixtures/g1-sample) plus 'wikidata-apple-extra',",
  "# drawn by tooling/src/spikes/g1-apple-hints/sample.ts. labels.json names each link's MusicBrainz release group.",
  "#   bun tooling/src/spikes/g1-apple-hints/run.ts tooling/fixtures/g1-apple/links.txt --cache",
];
let current = "";
for (const line of lines) {
  if (line.sample !== current) output.push("", `# sample: ${(current = line.sample)}`);
  output.push(line.item ? `${line.link} # ${line.item}` : line.link);
}
await Bun.write(path.join(root, "g1-apple/links.txt"), `${output.join("\n")}\n`);
await Bun.write(path.join(root, "g1-apple/labels.json"), `${JSON.stringify(labels, null, 2)}\n`);
console.log(`${lines.length} links, ${Object.keys(labels).length} labelled`);
