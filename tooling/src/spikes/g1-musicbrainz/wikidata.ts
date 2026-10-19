// Wikidata's query service for the G1 samples: albums' service ids and MusicBrainz release groups (P436), which
// label links with the album they truly are.

import { z } from "zod";

import { userAgent } from "./musicbrainz";

const bindingsSchema = z.object({
  results: z.object({
    bindings: z.array(z.record(z.string(), z.object({ value: z.string() }))),
  }),
});

/** Runs a SPARQL query and returns its bindings, each variable's value as a string. */
export async function sparql(query: string) {
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "application/sparql-results+json" },
  });
  if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
  return bindingsSchema.parse(await response.json()).results.bindings;
}

/** The item id of an entity IRI: `http://www.wikidata.org/entity/Q42` → `Q42`. */
export const entity = (iri: string) => iri.replace("http://www.wikidata.org/entity/", "");
