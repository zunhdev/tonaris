// Builds the TON-99 sample: every Qobuz link in the G1 sample (TON-14), plus Qobuz editions from the G2 corpus
// (TON-18), each labelled with the MusicBrainz release group it belongs to, so hint matches can be scored.
// - The G1 sample's labels come from Wikidata's P436 or, for the creator's links MusicBrainz doesn't link, from a
//   manual MusicBrainz search. Links MusicBrainz already knows also get their truth at run time, from step 2.
// - The G2 corpus holds the Qobuz links MusicBrainz relates to releases of the G1 albums, so each is labelled
//   with its release's album. One link per album keeps albums with many editions from weighing more.
//
//   bun tooling/src/spikes/g1-qobuz-hints/sample.ts
//
// It writes tooling/fixtures/g1-qobuz/links.txt and labels.json.

import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

import type { Label } from "../g1-apple-hints/match";
import { parseLink } from "../g1-musicbrainz/links";
import { entity, sparql } from "../g1-musicbrainz/wikidata";

const root = path.resolve(import.meta.dir, "../../../fixtures");
const extraSize = 50;

/** The creator's links MusicBrainz doesn't link, labelled by searching MusicBrainz by hand on 19 October 2026. */
const manualLabels: Record<string, string> = {
  // Мумий Тролль, Икра (1997).
  "https://open.qobuz.com/album/c6zb0r5qcrqoa": "54dc2ea4-d3da-319d-8ee9-c2f4faf98581",
  // Tchaikovsky, The Nutcracker: Berliner Philharmoniker, Simon Rattle (2010), not the highlights.
  "https://open.qobuz.com/album/z96u0k0znz1xb": "95959c5f-6011-4c20-b932-0a70b529e045",
  // The Jimi Hendrix Experience, Are You Experienced (1967), not the 2010 bootleg of the same name.
  "https://open.qobuz.com/album/0884977423006": "da40e720-2097-3730-8a7f-0c2ddbff4a96",
};

const rank = (key: string) => createHash("md5").update(`tonaris-g1-qobuz:${key}`).digest("hex");
const byRank = (a: string, b: string) => (rank(a) < rank(b) ? -1 : 1);

// The Qobuz links of the G1 sample, by sample, with their Wikidata items.
type Line = { sample: string; link: string; item?: string };
const lines: Line[] = [];
let sample = "";
for (const raw of (await Bun.file(path.join(root, "g1-sample/links.txt")).text()).split("\n")) {
  const marker = /^#\s*sample:\s*(\S+)/.exec(raw.trim());
  if (marker?.[1]) sample = marker[1];
  const [link, comment] = raw.split(/\s#\s*/);
  const parsed = link ? parseLink(link) : undefined;
  if (link && parsed?.ok && parsed.link.service === "qobuz") {
    lines.push({ sample, link: link.trim(), ...(comment && { item: comment.trim() }) });
  }
}

const labels: Record<string, Label> = {};
for (const [link, id] of Object.entries(manualLabels)) {
  labels[link] = { releaseGroupIds: [id], source: "manual MusicBrainz search, 19 October 2026" };
}

// Release groups of the Wikidata items in the sample.
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

// One Qobuz edition per G2 album, as MusicBrainz stores its link, for albums whose ids the G1 sample lacks.
const corpus = z
  .object({
    editions: z.array(z.object({ releaseGroupId: z.string(), links: z.array(z.string()) })),
  })
  .parse(await Bun.file(path.join(root, "g2-matching/corpus.json")).json());
const albumId = (link: string) => {
  const parsed = parseLink(link);
  return parsed.ok && parsed.link.service === "qobuz" ? parsed.link.albumId : undefined;
};
const sampled = new Set(lines.map((l) => albumId(l.link)));
const editions = corpus.editions.flatMap(({ releaseGroupId, links }) =>
  links.flatMap((link) => {
    const id = albumId(link);
    return id && !sampled.has(id) ? [{ releaseGroupId, link }] : [];
  }),
);
const linksOf = Map.groupBy(editions, (e) => e.releaseGroupId);
for (const group of [...linksOf.keys()].toSorted(byRank).slice(0, extraSize)) {
  const [link] = (linksOf.get(group) ?? []).map((e) => e.link).toSorted(byRank);
  if (!link) continue;
  lines.push({ sample: "g2-qobuz-editions", link });
  labels[link] = { releaseGroupIds: [group], source: "G2 corpus: MusicBrainz URL relationship" };
}

const output = [
  "# The TON-99 sample: the G1 sample's Qobuz links (tooling/fixtures/g1-sample) plus 'g2-qobuz-editions', one",
  "# Qobuz edition per album of the G2 corpus, drawn by tooling/src/spikes/g1-qobuz-hints/sample.ts. labels.json",
  "# names each link's MusicBrainz release group.",
  "#   bun tooling/src/spikes/g1-qobuz-hints/run.ts tooling/fixtures/g1-qobuz/links.txt",
];
let current = "";
for (const line of lines) {
  if (line.sample !== current) output.push("", `# sample: ${(current = line.sample)}`);
  output.push(line.item ? `${line.link} # ${line.item}` : line.link);
}
await Bun.write(path.join(root, "g1-qobuz/links.txt"), `${output.join("\n")}\n`);
await Bun.write(path.join(root, "g1-qobuz/labels.json"), `${JSON.stringify(labels, null, 2)}\n`);
console.log(`${lines.length} links, ${Object.keys(labels).length} labelled`);
