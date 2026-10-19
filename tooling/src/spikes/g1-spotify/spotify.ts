// A Spotify Web API client for the TON-15 spike: client credentials in development mode, the two calls TS-41
// step 3 needs, and nothing kept. Spotify values (the token, the UPC, a parent album id) live only in memory and
// are never logged, cached or written: callers get identifiers only, and `requests` records status and timing.
// Development mode has no published numbers: Spotify counts calls in a rolling 30-second window, per developer
// account since July 2026, and answers 429 with Retry-After, its body saying QUOTA_EXCEEDED for a quota.

import { z } from "zod";

import type { Fetcher } from "../g1-musicbrainz/links";

export type SpotifyRequest = {
  call: "token" | "album" | "track";
  status: number;
  /** From when the request was allowed to start until its body arrived, retries excluded. */
  ms: number;
  retries: number;
  /** Seconds Spotify asked for in Retry-After on each 429, and whether it said the quota ran out. */
  throttled?: { retryAfter: number; quota: boolean }[];
};

/** What Get Album yields for the bridge. The UPC is held only while the link is being identified. */
export type AlbumIds = { upc?: string };

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const albumSchema = z.object({ external_ids: z.object({ upc: z.string().optional() }).optional() });
const trackSchema = z.object({ album: z.object({ id: z.string() }) });
const errorSchema = z.object({ error: z.object({ reason: z.string().optional() }).optional() });

export type SpotifyOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: Fetcher;
  /** Milliseconds between request starts. */
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
};

export class Spotify {
  readonly requests: SpotifyRequest[] = [];
  private token?: { value: string; expiresAt: number };
  private nextStart = 0;
  private readonly fetcher: Fetcher;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: SpotifyOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.sleep = options.sleep ?? Bun.sleep;
  }

  /** Get Album's identifiers, or undefined when Spotify has no such album (404). */
  async album(id: string): Promise<AlbumIds | undefined> {
    const body = await this.get("album", `albums/${id}`);
    if (body === undefined) return undefined;
    const upc = albumSchema.parse(body).external_ids?.upc;
    return upc ? { upc } : {};
  }

  /** The id of the album a track link belongs to (FR-02.3), or undefined when Spotify has no such track. */
  async parentAlbum(trackId: string): Promise<string | undefined> {
    const body = await this.get("track", `tracks/${trackId}`);
    return body === undefined ? undefined : trackSchema.parse(body).album.id;
  }

  private async get(call: "album" | "track", pathname: string): Promise<unknown> {
    const token = await this.accessToken();
    const response = await this.paced(call, () =>
      this.fetcher(`https://api.spotify.com/v1/${pathname}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.ok) throw new Error(`Spotify answered ${response.status} to Get ${call}`);
    return response.json();
  }

  /** The client-credentials token, fetched again a minute before it expires (Spotify's last 3,600 s). */
  private async accessToken(): Promise<string> {
    if (this.token && performance.now() < this.token.expiresAt) return this.token.value;
    const { clientId, clientSecret } = this.options;
    const response = await this.paced("token", () =>
      this.fetcher("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      }),
    );
    if (!response.ok) throw new Error(`Spotify's token endpoint answered ${response.status}`);
    const { access_token: value, expires_in: expiresIn } = tokenSchema.parse(await response.json());
    this.token = { value, expiresAt: performance.now() + (expiresIn - 60) * 1_000 };
    return value;
  }

  /** Runs one request in its slot, waiting out 429s as Retry-After asks. */
  private async paced(
    call: SpotifyRequest["call"],
    send: () => Promise<Response>,
  ): Promise<Response> {
    const maxRetries = this.options.maxRetries ?? 3;
    const throttled: { retryAfter: number; quota: boolean }[] = [];
    for (let retries = 0; ; retries++) {
      const wait = this.nextStart - performance.now();
      // Requests are paced one after another, so each waits for the previous slot.
      // oxlint-disable-next-line no-await-in-loop
      if (wait > 0) await this.sleep(wait);
      const startedAt = performance.now();
      this.nextStart = startedAt + (this.options.minIntervalMs ?? 250);
      // oxlint-disable-next-line no-await-in-loop
      const response = await send();
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 2 ** retries);
        // oxlint-disable-next-line no-await-in-loop
        const body = errorSchema.safeParse(await response.json().catch(() => ({})));
        throttled.push({
          retryAfter,
          quota: body.success && body.data.error?.reason === "QUOTA_EXCEEDED",
        });
        if (retries < maxRetries) {
          this.nextStart = performance.now() + retryAfter * 1_000;
          continue;
        }
      }
      this.requests.push({
        call,
        status: response.status,
        ms: Math.round(performance.now() - startedAt),
        retries,
        ...(throttled.length > 0 && { throttled }),
      });
      return response;
    }
  }
}

/** Reads the credentials from the environment: Bun loads the repository root's `.env` for commands run there. */
export function spotifyFromEnv(options: Omit<SpotifyOptions, "clientId" | "clientSecret"> = {}) {
  const clientId = Bun.env.SPOTIFY_CLIENT_ID;
  const clientSecret = Bun.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the repository root's .env (see .env.example).",
    );
  }
  return new Spotify({ ...options, clientId, clientSecret });
}
