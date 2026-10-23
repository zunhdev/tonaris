// Runs one identification case (cases.ts) against recorded or live answers. MusicBrainz and iTunes Lookup answer
// from `recorded.json` in tests, or from the network while recording; every other host answers from the case's
// stubs. Store pages and Spotify are never recorded: their stubs carry MusicBrainz's facts (CC0) for the album,
// never a store's or Spotify's values (TS-41).

import { createIdentifier, type Identification } from "../../src/identify";
import { ItunesLookup } from "../../src/itunes";
import { MusicBrainz } from "../../src/musicbrainz";
import { memoryCache } from "../../src/provider-cache";
import type { SafeFetchInit } from "../../src/safe-fetch";
import { Spotify } from "../../src/spotify";
import { StorePages } from "../../src/store-pages";

/** An answer for a host that isn't recorded. A string body is sent as text, anything else as JSON. */
export type Stub = { status: number; headers?: Record<string, string>; body?: unknown };

export type IdentifyCase = {
  name: string;
  input: string;
  /** An agent's capture (FR-10.5). */
  agent?: boolean;
  /** Entity ids the owner's albums already have, as `{service}:{entityId}` → album id (step 1). */
  linked?: Record<string, string>;
  /** Whether the Spotify bridge is on. */
  spotify: boolean;
  /** Answers by URL, before any recording: Spotify, store pages, short links, and stand-ins for MusicBrainz. */
  stubs?: Record<string, Stub>;
};

/** Recorded answers by request URL. */
export type Recording = Record<string, { status: number; body: unknown }>;

const recordedHosts = new Set(["musicbrainz.org", "itunes.apple.com"]);

/** Answers every case shares: robots.txt allowing album pages, and a Spotify token. */
const sharedStubs: Record<string, Stub> = {
  "https://www.qobuz.com/robots.txt": {
    status: 200,
    body: "User-agent: *\nDisallow: /commande/\n",
  },
  "https://tidal.com/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\n" },
  "https://accounts.spotify.com/api/token": {
    status: 200,
    body: { access_token: "test-token", token_type: "Bearer", expires_in: 3_600 },
  },
};

function respond({ status, headers = {}, body }: Stub): Response {
  if (body === undefined) return new Response(null, { status, headers });
  return typeof body === "string"
    ? new Response(body, { status, headers: { "content-type": "text/html", ...headers } })
    : Response.json(body, { status, headers });
}

/** The MusicBrainz fields the chain reads; the rest of an answer is left out to keep recordings small. */
const musicBrainzFields = new Set([
  "urls",
  "resource",
  "relations",
  "target-type",
  "release",
  "release_group",
  "release-group",
  "releases",
  "release-groups",
  "id",
  "title",
  "date",
  "status",
  "barcode",
  "primary-type",
  "first-release-date",
  "artist-credit",
  "name",
  "joinphrase",
  "artist",
  "sort-name",
  "count",
  "url-count",
  "error",
]);

/** The iTunes fields TS-41 lets Tonaris keep: no artwork, previews or store URLs. */
const itunesFields = new Set([
  "resultCount",
  "results",
  "wrapperType",
  "collectionId",
  "collectionName",
  "artistName",
  "collectionArtistName",
  "releaseDate",
  "trackCount",
]);

/** An answer with only the fields `kept` names, at every depth. */
function trimmed(body: unknown, kept: ReadonlySet<string>): unknown {
  if (Array.isArray(body)) return body.map((item) => trimmed(item, kept));
  if (typeof body !== "object" || body === null) return body;
  return Object.fromEntries(
    Object.entries(body).flatMap(([key, value]) =>
      kept.has(key) ? [[key, trimmed(value, kept)]] : [],
    ),
  );
}

export type Source =
  | { recorded: Recording }
  | { record: Recording; fetch: (url: string, init: SafeFetchInit) => Promise<Response> };

/** The case's identifier, its cache and the requests it made, on a simulated clock unless recording. */
export function harness(testCase: IdentifyCase, source: Source) {
  const requests: string[] = [];
  const cache = memoryCache();
  let clock = Date.UTC(2026, 9, 24, 12);
  const time =
    "recorded" in source
      ? {
          now: () => clock,
          sleep: async (ms: number) => {
            clock += ms;
          },
        }
      : {};

  const fetch = async (url: string, init: SafeFetchInit): Promise<Response> => {
    requests.push(`${init.method ?? "GET"} ${url}`);
    const stub = testCase.stubs?.[url] ?? sharedStubs[url];
    if (stub) return respond(stub);
    const host = new URL(url).hostname;
    if (!recordedHosts.has(host)) throw new Error(`No stub for ${url}`);
    if ("recorded" in source) {
      const answer = source.recorded[url];
      if (!answer) throw new Error(`Not recorded: ${url}`);
      return Response.json(answer.body, { status: answer.status });
    }
    const response = await source.fetch(url, init);
    const body: unknown = await response.json();
    source.record[url] = {
      status: response.status,
      body: trimmed(body, host === "itunes.apple.com" ? itunesFields : musicBrainzFields),
    };
    return Response.json(body, { status: response.status });
  };

  const options = { cache, fetch, ...time };
  const { identify } = createIdentifier({
    musicBrainz: new MusicBrainz(options),
    itunes: new ItunesLookup(options),
    pages: new StorePages(options),
    spotify: testCase.spotify
      ? new Spotify({ clientId: "test", clientSecret: "test", ...options })
      : undefined,
    fetch,
  });
  return {
    cache,
    requests,
    identify: (): Promise<Identification> =>
      identify(testCase.input, {
        agent: testCase.agent ?? false,
        linked: async (service, entityId) => testCase.linked?.[`${service}:${entityId}`],
      }),
  };
}
