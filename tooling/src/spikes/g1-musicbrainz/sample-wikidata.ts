// Draws the G1 spike's supplementary sample from Wikidata, which records albums' Spotify (P2205), Apple Music
// (P2281) and Qobuz (P11770) ids apart from MusicBrainz. For each service it takes albums Wikidata links to a
// MusicBrainz release group (P436), which measures how often MusicBrainz has the service link when it has the
// album, and albums with no such link, which shows the coverage gaps. Wikidata favors notable albums, and some of
// its ids came from MusicBrainz, so this sample flatters MusicBrainz; the creator's own links are the real test.
//
//   bun tooling/src/spikes/g1-musicbrainz/sample-wikidata.ts >> tooling/fixtures/g1-sample/links.txt

import { createHash } from "node:crypto";

import { z } from "zod";

import { userAgent } from "./musicbrainz";

const services = [
  {
    name: "spotify",
    property: "P2205",
    link: (id: string) => `https://open.spotify.com/album/${id}`,
  },
  {
    name: "apple",
    property: "P2281",
    link: (id: string) => `https://music.apple.com/us/album/${id}`,
  },
  { name: "qobuz", property: "P11770", link: (id: string) => `https://open.qobuz.com/album/${id}` },
] as const;
const strata = [
  { name: "in-mb", filter: "FILTER EXISTS { ?item wdt:P436 [] }", size: 15 },
  { name: "not-in-mb", filter: "FILTER NOT EXISTS { ?item wdt:P436 [] }", size: 10 },
] as const;

const resultsSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({ item: z.object({ value: z.string() }), id: z.object({ value: z.string() }) }),
    ),
  }),
});

/** A stable pseudo-random order, so the same Wikidata answer always gives the same sample. */
const rank = (item: string) => createHash("md5").update(`tonaris-g1:${item}`).digest("hex");

for (const service of services) {
  for (const stratum of strata) {
    // Albums (Q482994) whose item IRI hashes into one sixteenth: an unbiased slice that keeps the query cheap.
    const query = `SELECT ?item ?id WHERE {
      ?item wdt:P31 wd:Q482994; wdt:${service.property} ?id.
      FILTER(STRSTARTS(MD5(STR(?item)), "0"))
      ${stratum.filter}
    } LIMIT 500`;
    const url = new URL("https://query.wikidata.org/sparql");
    url.searchParams.set("query", query);
    url.searchParams.set("format", "json");
    // Sampling one stratum after another keeps Wikidata's query service unhurried.
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/sparql-results+json" },
    });
    if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
    // oxlint-disable-next-line no-await-in-loop
    const { bindings } = resultsSchema.parse(await response.json()).results;
    const picked = bindings
      .map((b) => ({ item: b.item.value, id: b.id.value, rank: rank(b.item.value) }))
      .toSorted((a, b) => (a.rank < b.rank ? -1 : 1))
      .filter((b, i, all) => all.findIndex((other) => other.item === b.item) === i)
      .slice(0, stratum.size);
    console.log(`\n# sample: wikidata-${service.name}-${stratum.name}`);
    for (const { item, id } of picked)
      console.log(`${service.link(id)} # ${item.replace("http://www.wikidata.org/entity/", "")}`);
  }
}
