// The public iTunes Lookup API (no key) for TON-16: the hints TS-41 step 4 would use for Apple Music links.
// Apple documents roughly 20 calls a minute, so calls start at least 3 s apart. An optional on-disk cache keeps
// raw responses out of the repository: the terms review (TON-17) hasn't settled what may be kept.

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Fetcher } from "../g1-musicbrainz/links";

export type Hints = {
  title: string;
  artist: string;
  /** `YYYY-MM-DD`, as Apple reports it. */
  date: string;
  trackCount: number;
  /** The storefront that had the album. */
  storefront: string;
};

const lookupSchema = z.object({
  results: z.array(
    z.object({
      wrapperType: z.string(),
      collectionName: z.string().optional(),
      artistName: z.string().optional(),
      releaseDate: z.string().optional(),
      trackCount: z.number().optional(),
    }),
  ),
});

export type ItunesOptions = {
  fetch?: Fetcher;
  cacheDir?: string;
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class Itunes {
  requests = 0;
  private nextStart = 0;

  constructor(private readonly options: ItunesOptions = {}) {}

  /** The album's hints from the first storefront that has it, or undefined when none does. */
  async hints(albumId: string, storefronts: readonly string[]): Promise<Hints | undefined> {
    for (const storefront of storefronts) {
      // Storefronts are tried in order, and each call waits for its slot.
      // oxlint-disable-next-line no-await-in-loop
      const body = await this.lookup(albumId, storefront);
      const album = lookupSchema.parse(body).results.find((r) => r.wrapperType === "collection");
      if (album?.collectionName && album.artistName && album.releaseDate && album.trackCount) {
        return {
          title: album.collectionName,
          artist: album.artistName,
          date: album.releaseDate.slice(0, 10),
          trackCount: album.trackCount,
          storefront,
        };
      }
    }
    return undefined;
  }

  private async lookup(albumId: string, storefront: string): Promise<unknown> {
    const url = `https://itunes.apple.com/lookup?id=${albumId}&country=${storefront}`;
    const { cacheDir } = this.options;
    const file =
      cacheDir && path.join(cacheDir, `${createHash("sha256").update(url).digest("hex")}.json`);
    if (file && (await Bun.file(file).exists())) return Bun.file(file).json();

    const wait = this.nextStart - performance.now();
    if (wait > 0) await (this.options.sleep ?? Bun.sleep)(wait);
    this.nextStart = performance.now() + (this.options.minIntervalMs ?? 3_000);
    this.requests++;
    const response = await (this.options.fetch ?? fetch)(url, {});
    if (!response.ok) throw new Error(`iTunes Lookup answered ${response.status} for ${url}`);
    const body: unknown = await response.json();
    if (file && cacheDir) {
      await mkdir(cacheDir, { recursive: true });
      await Bun.write(file, JSON.stringify(body));
    }
    return body;
  }
}
