// MusicBrainz and the Cover Art Archive, as TS-41's chain and enrichment ask them. MusicBrainz allows 1 request
// per second per IP: every request waits its turn in one queue per process, turns start a second apart, and busy
// answers are retried with backoff that holds the whole queue back. Answers keyed by URL, barcode and MBID are kept
// for 7 days; misses keyed by Spotify-derived values are not. Every request goes through `safeFetch` (TS-103).

import { z } from "zod";

import type { ProviderCache } from "@tonaris/domain";

import { ProviderUnavailableError } from "./errors";
import { PacedQueue, realClock } from "./paced-queue";
import { safeFetch, SafeFetchError, type SafeFetchInit } from "./safe-fetch";

const api = "https://musicbrainz.org/ws/2";
const coverArtArchive = "https://coverartarchive.org";

/** Turns start at least this far apart (TS-41). */
export const musicBrainzIntervalMs = 1_000;
/** Retries of a busy or failed request before the lookup gives up. */
export const musicBrainzMaxRetries = 4;
/** How long answers are kept (TS-41). */
export const providerCacheMs = 7 * 86_400_000;

export type MusicBrainzEntity = "release" | "release-group";

/** What a URL is linked to in MusicBrainz. */
export type UrlTarget = { kind: MusicBrainzEntity; id: string; title: string };

/** A release whose barcode is exactly one of the forms asked for. */
export type BarcodeRelease = { id: string; title: string; barcode: string; releaseGroupId: string };

/**
 * Whether forms MusicBrainz doesn't know are kept as misses. `false` for values derived from Spotify, such as a UPC
 * or a parent album's URL, whose misses must leave nothing behind (TS-41).
 */
export type CachePolicy = { cacheMisses: boolean };

export type MusicBrainzOptions = {
  cache: ProviderCache;
  fetch?: (url: string, init: SafeFetchInit) => Promise<Response>;
  /** Milliseconds since the epoch; tests pass a simulated clock with `sleep`. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const targetSchema = z.object({ id: z.string(), title: z.string() });
const urlSchema = z.object({
  resource: z.string(),
  relations: z
    .array(
      z.object({
        "target-type": z.string(),
        release: targetSchema.optional(),
        release_group: targetSchema.optional(),
      }),
    )
    .default([]),
});
const urlLookupSchema = z.union([z.object({ urls: z.array(urlSchema) }), urlSchema]);
const barcodeSearchSchema = z.object({
  releases: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      barcode: z.string().nullish(),
      "release-group": z.object({ id: z.string() }).optional(),
    }),
  ),
});
const keptTargetsSchema = z.object({
  targets: z.array(
    z.object({ kind: z.enum(["release", "release-group"]), id: z.string(), title: z.string() }),
  ),
});
const keptReleasesSchema = z.object({
  releases: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      barcode: z.string(),
      releaseGroupId: z.string(),
    }),
  ),
});
const keptBodySchema = z.object({ body: z.unknown() });
const keptFrontSchema = z.object({ url: z.string().nullable() });

const mbid = z.uuid();
const retriedStatuses = new Set([502, 503, 504]);
const retriedFailures = new Set(["timeout", "network", "dns"]);

/** Keys in the cache, namespaced by provider (`ProviderCache`). */
const keys = {
  url: (url: string) => `musicbrainz:url:${url}`,
  barcode: (barcode: string) => `musicbrainz:barcode:${barcode}`,
  entity: (entity: MusicBrainzEntity, id: string, inc: readonly string[]) =>
    `musicbrainz:${entity}:${id}:${inc.toSorted().join("+")}`,
  front: (id: string) => `coverartarchive:release-group-front:${id}`,
};

/**
 * One client per process: its queue is what keeps every lookup, from every capture and enrichment, at one
 * request per second.
 */
export class MusicBrainz {
  private readonly cache: ProviderCache;
  private readonly fetch: NonNullable<MusicBrainzOptions["fetch"]>;
  private readonly now: () => number;
  /** MusicBrainz's 1 request a second, for every lookup of this process. */
  private readonly queue: PacedQueue;
  /** Requests in flight by URL, so identical lookups share one. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor({
    cache,
    fetch = safeFetch,
    now = realClock.now,
    sleep = realClock.sleep,
  }: MusicBrainzOptions) {
    this.cache = cache;
    this.fetch = fetch;
    this.now = now;
    this.queue = new PacedQueue(musicBrainzIntervalMs, { now, sleep });
  }

  /**
   * TS-41 step 2: what each of `forms`, one link's URL forms, is linked to, in one request. Forms MusicBrainz
   * doesn't know answer an empty list; a URL it knows is also answered under its own spelling.
   */
  async urls(forms: readonly string[], policy: CachePolicy): Promise<Map<string, UrlTarget[]>> {
    const kept = await this.kept(
      forms.map((form) => keys.url(form)),
      (value) => keptTargetsSchema.parse(value).targets,
    );
    if (kept) return new Map(forms.map((form) => [form, kept.get(keys.url(form)) ?? []]));

    const body = await this.request("url", {
      resource: forms,
      inc: "release-rels release-group-rels",
    });
    const lookup = body === null ? { urls: [] } : urlLookupSchema.parse(body);
    const found = new Map(
      ("urls" in lookup ? lookup.urls : [lookup]).map((url) => [
        url.resource,
        url.relations.flatMap((relation): UrlTarget[] =>
          relation["target-type"] === "release" && relation.release
            ? [{ kind: "release", ...relation.release }]
            : relation["target-type"] === "release_group" && relation.release_group
              ? [{ kind: "release-group", ...relation.release_group }]
              : [],
        ),
      ]),
    );
    await this.keep(
      [...found].map(([url, targets]) => ({ key: keys.url(url), value: { targets } })),
      forms
        .filter((form) => !found.has(form))
        .map((form) => ({ key: keys.url(form), value: { targets: [] } })),
      policy,
    );
    return new Map([...forms.map((form): [string, UrlTarget[]] => [form, []]), ...found]);
  }

  /**
   * TS-41 step 3: releases whose barcode is exactly one of `forms`, one barcode's 12-, 13- and 14-digit forms, in
   * one search. A hit is kept under the barcode as the release carries it.
   */
  async barcodes(forms: readonly string[], policy: CachePolicy): Promise<BarcodeRelease[]> {
    const kept = await this.kept(
      forms.map((form) => keys.barcode(form)),
      (value) => keptReleasesSchema.parse(value).releases,
    );
    if (kept) return [...kept.values()].flat();

    const body = await this.request("release", {
      query: forms.map((form) => `barcode:${form}`).join(" OR "),
      limit: "100",
    });
    const releases = (body === null ? [] : barcodeSearchSchema.parse(body).releases).flatMap(
      (release): BarcodeRelease[] =>
        release.barcode && forms.includes(release.barcode) && release["release-group"]
          ? [
              {
                id: release.id,
                title: release.title,
                barcode: release.barcode,
                releaseGroupId: release["release-group"].id,
              },
            ]
          : [],
    );
    const byBarcode = Map.groupBy(releases, (release) => release.barcode);
    await this.keep(
      [...byBarcode].map(([barcode, found]) => ({
        key: keys.barcode(barcode),
        value: { releases: found },
      })),
      forms
        .filter((form) => !byBarcode.has(form))
        .map((form) => ({ key: keys.barcode(form), value: { releases: [] } })),
      policy,
    );
    return releases;
  }

  /** A release or release group by MBID, with `inc`, as MusicBrainz answers it, or null if it has none. */
  async lookup(entity: MusicBrainzEntity, id: string, inc: readonly string[]): Promise<unknown> {
    mbid.parse(id);
    const key = keys.entity(entity, id, inc);
    const kept = (await this.cache.get([key], new Date(this.now()))).get(key);
    if (kept !== undefined) return keptBodySchema.parse(kept).body;
    const body = await this.request(
      `${entity}/${id}`,
      inc.length > 0 ? { inc: inc.join(" ") } : {},
    );
    await this.cache.set([{ key, value: { body } }], this.expiry());
    return body;
  }

  /** A search, such as step 4's from a store page's hints. Never kept: the hints' data mustn't be (TS-41). */
  search(entity: MusicBrainzEntity, query: string, limit = 25): Promise<unknown> {
    return this.request(entity, { query, limit: String(limit) });
  }

  /**
   * The release group's front image on the Cover Art Archive, as its stable `front-500` address, or null if it
   * has none. The archive is outside MusicBrainz's limit, so this isn't queued.
   */
  async releaseGroupFront(id: string): Promise<string | null> {
    mbid.parse(id);
    const key = keys.front(id);
    const kept = (await this.cache.get([key], new Date(this.now()))).get(key);
    if (kept !== undefined) return keptFrontSchema.parse(kept).url;
    const address = `${coverArtArchive}/release-group/${id}/front-500`;
    let response: Response;
    try {
      response = await this.fetch(address, { method: "HEAD", redirect: "manual" });
    } catch (error) {
      throw new ProviderUnavailableError("coverartarchive", "The Cover Art Archive didn't answer", {
        cause: error,
      });
    }
    void response.body?.cancel().catch(() => {});
    let url: string | null;
    if (response.status >= 300 && response.status < 400) url = address;
    else if (response.status === 404) url = null;
    else {
      throw new ProviderUnavailableError(
        "coverartarchive",
        `The Cover Art Archive answered ${response.status} for a release group's front`,
      );
    }
    await this.cache.set([{ key, value: { url } }], this.expiry());
    return url;
  }

  private expiry(): Date {
    return new Date(this.now() + providerCacheMs);
  }

  /**
   * What the cache keeps for a lookup over several forms, when that is its whole answer: every form is kept, or
   * one is kept as found. A lookup whose misses aren't kept (Spotify's) would otherwise never be answered here.
   */
  private async kept<T>(
    formKeys: readonly string[],
    parse: (value: unknown) => T[],
  ): Promise<Map<string, T[]> | undefined> {
    const entries = await this.cache.get(formKeys, new Date(this.now()));
    const parsed = new Map([...entries].map(([key, value]) => [key, parse(value)]));
    const complete = formKeys.every((key) => parsed.has(key));
    const found = [...parsed.values()].some((values) => values.length > 0);
    return complete || found ? parsed : undefined;
  }

  /** Keeps what was found, and what wasn't only if the policy allows. */
  private async keep(
    hits: readonly { key: string; value: object }[],
    misses: readonly { key: string; value: object }[],
    { cacheMisses }: CachePolicy,
  ): Promise<void> {
    const entries = cacheMisses ? [...hits, ...misses] : hits;
    if (entries.length > 0) await this.cache.set(entries, this.expiry());
  }

  /** GETs `/ws/2/{path}` as JSON through the queue, sharing a request already in flight. A 404 answers null. */
  private request(
    path: string,
    params: Record<string, string | readonly string[]>,
  ): Promise<unknown> {
    const url = new URL(`${api}/${path}`);
    for (const [name, value] of Object.entries(params)) {
      for (const item of typeof value === "string" ? [value] : value)
        url.searchParams.append(name, item);
    }
    url.searchParams.set("fmt", "json");
    const shared = this.inFlight.get(url.href);
    if (shared) return shared;
    const request = this.send(url).finally(() => this.inFlight.delete(url.href));
    this.inFlight.set(url.href, request);
    return request;
  }

  /** Holds the whole queue back after a busy answer: MusicBrainz's limit is everyone's. */
  private backOff(retry: number, retryAfter: string | null): void {
    this.queue.holdFor(Math.max(Number(retryAfter) || 0, 2 ** retry) * 1_000);
  }

  private async send(url: URL): Promise<unknown> {
    // Messages name the path only: queries carry barcodes and URLs, some derived from Spotify (TS-41).
    const where = url.pathname;
    let failure: unknown;
    for (let retry = 0; retry <= musicBrainzMaxRetries; retry++) {
      // Each attempt waits for its turn after the one before, by design.
      // oxlint-disable-next-line no-await-in-loop
      await this.queue.turn();
      let response: Response;
      try {
        // oxlint-disable-next-line no-await-in-loop
        response = await this.fetch(url.href, { headers: { accept: "application/json" } });
      } catch (error) {
        if (!(error instanceof SafeFetchError && retriedFailures.has(error.reason))) {
          throw new ProviderUnavailableError(
            "musicbrainz",
            `MusicBrainz can't be asked for ${where}`,
            {
              cause: error,
            },
          );
        }
        failure = error;
        this.backOff(retry, null);
        continue;
      }
      if (retriedStatuses.has(response.status)) {
        void response.body?.cancel().catch(() => {});
        failure = new Error(`MusicBrainz answered ${response.status}`);
        this.backOff(retry, response.headers.get("retry-after"));
        continue;
      }
      if (response.status === 404) {
        void response.body?.cancel().catch(() => {});
        return null;
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`MusicBrainz answered ${response.status} for ${where}`);
      }
      try {
        // oxlint-disable-next-line no-await-in-loop
        return await response.json();
      } catch (error) {
        throw new ProviderUnavailableError(
          "musicbrainz",
          `MusicBrainz's answer for ${where} isn't JSON`,
          {
            cause: error,
          },
        );
      }
    }
    throw new ProviderUnavailableError(
      "musicbrainz",
      `MusicBrainz was busy for ${where} after ${musicBrainzMaxRetries} retries`,
      { cause: failure },
    );
  }
}
