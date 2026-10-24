// Runs one album case (cases.ts) through `describeAlbum()` against recorded or live answers. MusicBrainz and the
// Cover Art Archive answer from `recorded.json` in tests, or from the network while recording; a case's stubs answer
// first. The archive is recorded as status and `Location` only: no image is ever fetched or kept.

import { describeAlbum } from "../../src/album-facts";
import { MusicBrainz } from "../../src/musicbrainz";
import { memoryCache } from "../../src/provider-cache";
import type { SafeFetchInit } from "../../src/safe-fetch";

/** An answer standing in for a host's. */
export type Stub = { status: number; headers?: Record<string, string>; body?: unknown };

export type DescribeCase = {
  name: string;
  releaseGroupId: string;
  /** Answers by URL, before any recording. */
  stubs?: Record<string, Stub>;
};

/** Recorded answers by request URL: MusicBrainz's body, or the archive's `Location`. */
export type Recording = Record<string, { status: number; body?: unknown; location?: string }>;

const recordedHosts = new Set(["musicbrainz.org", "coverartarchive.org"]);

/** The MusicBrainz fields enrichment reads; the rest of an answer is left out to keep recordings small. */
const musicBrainzFields = new Set([
  "id",
  "title",
  "primary-type",
  "secondary-types",
  "first-release-date",
  "artist-credit",
  "name",
  "joinphrase",
  "releases",
  "status",
  "date",
  "media",
  "tracks",
  "recording",
  "relations",
  "type",
  "target-type",
  "begin",
  "end",
  "event",
  "life-span",
  "error",
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

function respond({ status, headers = {}, body }: Stub): Response {
  return body === undefined
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });
}

/** The URL `MusicBrainz` asks for a lookup, for stubbing one. */
export function lookupUrl(entity: string, id: string, inc: readonly string[]): string {
  const url = new URL(`https://musicbrainz.org/ws/2/${entity}/${id}`);
  url.searchParams.append("inc", inc.join(" "));
  url.searchParams.set("fmt", "json");
  return url.href;
}

/** The Cover Art Archive address asked for a release group's front. */
export const frontUrl = (id: string) => `https://coverartarchive.org/release-group/${id}/front-500`;

export type Source =
  | { recorded: Recording }
  | { record: Recording; fetch: (url: string, init: SafeFetchInit) => Promise<Response> };

/** The case's lookup, its cache and the requests it made, on a simulated clock unless recording. */
export function harness(testCase: DescribeCase, source: Source) {
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
    const stub = testCase.stubs?.[url];
    if (stub) return respond(stub);
    const host = new URL(url).hostname;
    if (!recordedHosts.has(host)) throw new Error(`No stub for ${url}`);
    if ("recorded" in source) {
      const answer = source.recorded[url];
      if (!answer) throw new Error(`Not recorded: ${url}`);
      if (answer.body === undefined) {
        const headers: Record<string, string> = answer.location
          ? { location: answer.location }
          : {};
        return new Response(null, { status: answer.status, headers });
      }
      return Response.json(answer.body, { status: answer.status });
    }
    const response = await source.fetch(url, init);
    if (host === "coverartarchive.org") {
      void response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      source.record[url] = { status: response.status, ...(location ? { location } : {}) };
      return new Response(null, { status: response.status, headers: response.headers });
    }
    const body: unknown = await response.json();
    source.record[url] = { status: response.status, body: trimmed(body, musicBrainzFields) };
    return Response.json(body, { status: response.status });
  };

  const musicBrainz = new MusicBrainz({ cache, fetch, ...time });
  return {
    cache,
    requests,
    musicBrainz,
    describe: () => describeAlbum(musicBrainz, testCase.releaseGroupId),
  };
}
