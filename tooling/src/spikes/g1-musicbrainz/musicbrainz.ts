// A MusicBrainz client for the G1 spike: one request per second, start to start, with a meaningful
// User-Agent (TS-41, https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting). MusicBrainz answers 503 when
// a client goes faster, so 503s are retried with backoff and counted. An optional on-disk cache lets the report
// be re-run without new requests; latency runs go without it.

import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type { Fetcher } from "./links";

export const userAgent = "Tonaris/0.1 ( https://github.com/zunhdev/tonaris )";
const baseUrl = "https://musicbrainz.org/ws/2";
const cachedSchema = z.object({ status: z.number(), body: z.unknown() });

export type RequestRecord = {
  url: string;
  status: number;
  /** From when the request was allowed to start until its body arrived. */
  ms: number;
  /** Time spent waiting for its turn in the 1 request/second queue. */
  queuedMs: number;
  /** From joining the queue until its body arrived, retries included. */
  totalMs: number;
  retries: number;
  cached: boolean;
};

export type ClientOptions = {
  fetch?: Fetcher;
  cacheDir?: string;
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class MusicBrainz {
  readonly requests: RequestRecord[] = [];
  private nextStart = 0;
  private readonly fetcher: Fetcher;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ClientOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.sleep = options.sleep ?? Bun.sleep;
  }

  /** GETs `/ws/2/{path}` as JSON. A 404 returns null: MusicBrainz knows nothing at that address. */
  async get(
    pathname: string,
    params: Record<string, string | readonly string[]>,
  ): Promise<unknown> {
    const url = new URL(`${baseUrl}/${pathname}`);
    for (const [key, value] of Object.entries(params)) {
      for (const item of typeof value === "string" ? [value] : value)
        url.searchParams.append(key, item);
    }
    url.searchParams.set("fmt", "json");

    const cacheFile = this.options.cacheDir
      ? path.join(
          this.options.cacheDir,
          `${createHash("sha256").update(url.href).digest("hex")}.json`,
        )
      : undefined;
    if (cacheFile) {
      const cached = Bun.file(cacheFile);
      if (await cached.exists()) {
        const { status, body } = cachedSchema.parse(await cached.json());
        this.requests.push({
          url: url.href,
          status,
          ms: 0,
          queuedMs: 0,
          totalMs: 0,
          retries: 0,
          cached: true,
        });
        return body;
      }
    }

    const { status, body, ms, queuedMs, totalMs, retries } = await this.fetchPaced(url);
    this.requests.push({ url: url.href, status, ms, queuedMs, totalMs, retries, cached: false });
    if (cacheFile && this.options.cacheDir) {
      await mkdir(this.options.cacheDir, { recursive: true });
      await Bun.write(cacheFile, JSON.stringify({ status, body }));
    }
    return body;
  }

  private async fetchPaced(url: URL) {
    const interval = this.options.minIntervalMs ?? 1_000;
    const maxRetries = this.options.maxRetries ?? 5;
    const queuedAt = performance.now();
    let queuedMs = 0;
    for (let retries = 0; ; retries++) {
      const wait = Math.max(0, this.nextStart - performance.now());
      // Requests are paced one after another, so each waits for the previous slot.
      // oxlint-disable-next-line no-await-in-loop
      if (wait > 0) await this.sleep(wait);
      if (retries === 0) queuedMs = performance.now() - queuedAt;
      const startedAt = performance.now();
      this.nextStart = startedAt + interval;
      // oxlint-disable-next-line no-await-in-loop
      const response = await this.fetcher(url.href, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
      });
      if (response.status === 503 && retries < maxRetries) {
        // When MusicBrainz's global limit refuses everyone it says `Retry-After: 0`, so back off regardless.
        const header = Number(response.headers.get("retry-after") ?? 0);
        const retryAfter = Math.max(header, 2 ** retries);
        this.nextStart = performance.now() + retryAfter * 1_000;
        // oxlint-disable-next-line no-await-in-loop
        await response.body?.cancel();
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop
      const body: unknown = response.status === 404 ? null : await response.json();
      if (!response.ok && response.status !== 404) {
        throw new Error(`MusicBrainz answered ${response.status} for ${url.href}`);
      }
      return {
        status: response.status,
        body,
        ms: performance.now() - startedAt,
        queuedMs,
        totalMs: performance.now() - queuedAt,
        retries,
      };
    }
  }
}
