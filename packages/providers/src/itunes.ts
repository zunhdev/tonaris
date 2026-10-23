// iTunes Lookup (TS-41): Apple's public, keyless API, documented for "ID-based lookup … to create mappings" at about
// 20 calls a minute, so calls start at least 3 s apart. It gives step 4's hints for Apple Music links, and the
// album a `/song/` link's song belongs to. Only the title, artist, date, track count and album id are kept, for a
// day: never artwork, previews or store URLs (TS-41).

import { z } from "zod";

import { PacedQueue, realClock } from "./paced-queue";
import { ProviderUnavailableError, type ProviderCache } from "./provider-cache";
import { safeFetch, type SafeFetchInit } from "./safe-fetch";

/** Calls start at least this far apart: 20 a minute. */
export const itunesIntervalMs = 3_000;
/** How long answers are kept (TS-41). */
export const itunesCacheMs = 86_400_000;

/** An album as iTunes Lookup describes it: step 4's hints, and the prefill for manual entry. */
export type AppleAlbum = {
  albumId: string;
  title: string;
  artist: string;
  /** `YYYY-MM-DD`. */
  date: string;
  trackCount: number;
};

export type ItunesOptions = {
  cache: ProviderCache;
  fetch?: (url: string, init: SafeFetchInit) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const resultSchema = z.object({
  wrapperType: z.string(),
  collectionId: z.number().optional(),
  collectionName: z.string().optional(),
  artistName: z.string().optional(),
  collectionArtistName: z.string().optional(),
  releaseDate: z.string().optional(),
  trackCount: z.number().optional(),
});
const lookupSchema = z.object({ results: z.array(resultSchema) });
const keptSchema = z.object({
  album: z
    .object({
      albumId: z.string(),
      title: z.string(),
      artist: z.string(),
      date: z.string(),
      trackCount: z.number(),
    })
    .nullable(),
});

const appleId = /^\d+$/;

export class ItunesLookup {
  private readonly cache: ProviderCache;
  private readonly fetch: NonNullable<ItunesOptions["fetch"]>;
  private readonly now: () => number;
  private readonly queue: PacedQueue;

  constructor({
    cache,
    fetch = safeFetch,
    now = realClock.now,
    sleep = realClock.sleep,
  }: ItunesOptions) {
    this.cache = cache;
    this.fetch = fetch;
    this.now = now;
    this.queue = new PacedQueue(itunesIntervalMs, { now, sleep });
  }

  /** The album with this id, from the first storefront that has it. */
  album(albumId: string, storefronts: readonly string[]): Promise<AppleAlbum | undefined> {
    return this.first(albumId, storefronts, "collection");
  }

  /** The album a song belongs to, from the first storefront that has the song (FR-02.3). */
  songAlbum(songId: string, storefronts: readonly string[]): Promise<AppleAlbum | undefined> {
    return this.first(songId, storefronts, "track");
  }

  private async first(
    id: string,
    storefronts: readonly string[],
    wrapperType: "collection" | "track",
  ): Promise<AppleAlbum | undefined> {
    if (!appleId.test(id)) return undefined;
    for (const storefront of new Set(storefronts)) {
      // Storefronts are tried in order, each waiting its turn.
      // oxlint-disable-next-line no-await-in-loop
      const album = await this.lookup(id, storefront, wrapperType);
      if (album) return album;
    }
    return undefined;
  }

  private async lookup(
    id: string,
    storefront: string,
    wrapperType: "collection" | "track",
  ): Promise<AppleAlbum | null> {
    const key = `itunes:lookup:${id}:${storefront}`;
    const kept = (await this.cache.get([key], new Date(this.now()))).get(key);
    if (kept !== undefined) return keptSchema.parse(kept).album;

    await this.queue.turn();
    const url = new URL("https://itunes.apple.com/lookup");
    url.searchParams.set("id", id);
    url.searchParams.set("country", storefront);
    let body: unknown;
    try {
      const response = await this.fetch(url.href, { headers: { accept: "application/json" } });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`iTunes Lookup answered ${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      throw new ProviderUnavailableError("itunes", "iTunes Lookup didn't answer", { cause: error });
    }
    const result = lookupSchema
      .parse(body)
      .results.find((entry) => entry.wrapperType === wrapperType);
    const artist = result?.collectionArtistName ?? result?.artistName;
    const album =
      result?.collectionId &&
      result.collectionName &&
      artist &&
      result.releaseDate &&
      result.trackCount
        ? {
            albumId: String(result.collectionId),
            title: result.collectionName,
            artist,
            date: result.releaseDate.slice(0, 10),
            trackCount: result.trackCount,
          }
        : null;
    await this.cache.set([{ key, value: { album } }], new Date(this.now() + itunesCacheMs));
    return album;
  }
}
