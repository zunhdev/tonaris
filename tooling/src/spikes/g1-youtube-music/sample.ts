// Builds the YouTube Music sample for the G1 spike on YouTube Music links (TON-128): albums Wikidata records an
// album playlist for (P4300, `OLAK5uy_…`), as TON-100 drew Tidal's. Albums Wikidata links to a MusicBrainz release
// group (P436) measure how often MusicBrainz has the link when it has the album; albums with no such link show the
// coverage gap. labels.json names each linked album's release group. Links take the form YouTube Music's share
// menu gives: https://music.youtube.com/playlist?list={id}.
//
//   bun tooling/src/spikes/g1-youtube-music/sample.ts
//   bun tooling/src/spikes/g1-musicbrainz/run.ts tooling/fixtures/g1-youtube-music/links.txt --cache
//
// It writes tooling/fixtures/g1-youtube-music/links.txt and labels.json.

import { createHash } from "node:crypto";
import path from "node:path";

import type { Label } from "../g1-apple-hints/match";
import { entity, sparql } from "../g1-musicbrainz/wikidata";

const root = path.resolve(import.meta.dir, "../../../fixtures/g1-youtube-music");
const strata = [
  // Albums whose item IRI hashes into one sixteenth, or two for the rarer stratum: an unbiased, cheap slice.
  {
    name: "wikidata-youtube-music-in-mb",
    filter: "FILTER EXISTS { ?item wdt:P436 [] }",
    slices: '"0"',
    size: 50,
  },
  {
    name: "wikidata-youtube-music-not-in-mb",
    filter: "FILTER NOT EXISTS { ?item wdt:P436 [] }",
    slices: '"0" "1" "2" "3"',
    size: 25,
  },
] as const;

const rank = (item: string) =>
  createHash("md5").update(`tonaris-g1-youtube-music:${item}`).digest("hex");

const output = [
  "# The YouTube Music sample for the G1 spike (TON-128), drawn from Wikidata by",
  "# tooling/src/spikes/g1-youtube-music/sample.ts. Each line's comment names its Wikidata item; labels.json names",
  "# the linked albums' release groups.",
  "#   bun tooling/src/spikes/g1-musicbrainz/run.ts tooling/fixtures/g1-youtube-music/links.txt --cache",
];
const labels: Record<string, Label> = {};
for (const stratum of strata) {
  // One stratum after another keeps Wikidata's query service unhurried.
  // oxlint-disable-next-line no-await-in-loop
  const bindings = await sparql(`SELECT ?item ?id ?rg WHERE {
    ?item wdt:P31 wd:Q482994; wdt:P4300 ?id.
    FILTER(STRSTARTS(?id, "OLAK5uy_"))
    VALUES ?slice { ${stratum.slices} }
    FILTER(STRSTARTS(MD5(STR(?item)), ?slice))
    ${stratum.filter}
    OPTIONAL { ?item wdt:P436 ?rg }
  } LIMIT 2000`);
  const byItem = Map.groupBy(bindings, (b) => entity(b.item?.value ?? ""));
  const picked = [...byItem.keys()]
    .toSorted((a, b) => (rank(a) < rank(b) ? -1 : 1))
    .slice(0, stratum.size);
  output.push("", `# sample: ${stratum.name}`);
  for (const item of picked) {
    const rows = byItem.get(item) ?? [];
    const id = rows.map((b) => b.id?.value ?? "").toSorted()[0];
    if (!id) continue;
    const link = `https://music.youtube.com/playlist?list=${id}`;
    output.push(`${link} # ${item}`);
    const groups = [...new Set(rows.flatMap((b) => (b.rg ? [b.rg.value] : [])))];
    if (groups.length > 0)
      labels[link] = { releaseGroupIds: groups, source: `Wikidata ${item} P436` };
  }
}
await Bun.write(path.join(root, "links.txt"), `${output.join("\n")}\n`);
await Bun.write(path.join(root, "labels.json"), `${JSON.stringify(labels, null, 2)}\n`);
console.log(
  `${output.filter((l) => l.startsWith("https://")).length} links, ${Object.keys(labels).length} labelled`,
);
