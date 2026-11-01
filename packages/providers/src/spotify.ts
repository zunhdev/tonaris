// Spotify's Web API for TS-41 step 3, with client credentials in an app the creator owns (Premium). Two calls:
// Get Album for the UPC, and Get Track for a track link's album. Spotify values (the token, a UPC, a parent album
// id) live only in memory while a link is identified: nothing here is cached, kept between attempts, or put in an
// error, which names the call and never an id (TS-41). Spotify's titles and artists are never read.

import { z } from "zod";

import { ProviderUnavailableError } from "./errors";
import { PacedQueue, realClock } from "./paced-queue";
import { safeFetch, type SafeFetchInit } from "./safe-fetch";

/** Calls start at least this far apart. Development mode publishes no numbers; the spike saw no throttling. */
export const spotifyIntervalMs = 250;
/** 429s waited out before giving up. */
export const spotifyMaxRetries = 3;

export type SpotifyOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: (url: string, init: SafeFetchInit) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const albumSchema = z.object({ external_ids: z.object({ upc: z.string().optional() }).optional() });
const trackSchema = z.object({ album: z.object({ id: z.string() }) });
const spotifyId = /^[0-9A-Za-z]{22}$/;

type Call = "Get Album" | "Get Track" | "the token";

export class Spotify {
  private readonly options: SpotifyOptions;
  private readonly fetch: NonNullable<SpotifyOptions["fetch"]>;
  private readonly now: () => number;
  private readonly queue: PacedQueue;
  private token: { value: string; expiresAt: number } | undefined;

  constructor(options: SpotifyOptions) {
    const { fetch = safeFetch, now = realClock.now, sleep = realClock.sleep } = options;
    this.options = options;
    this.fetch = fetch;
    this.now = now;
    this.queue = new PacedQueue(spotifyIntervalMs, { now, sleep });
  }

  /** Get Album's UPC, held only by the caller; undefined when Spotify has no such album. */
  async album(id: string): Promise<{ upc?: string } | undefined> {
    const body = await this.get("Get Album", "albums", id);
    if (body === undefined) return undefined;
    const upc = albumSchema.parse(body).external_ids?.upc;
    return upc ? { upc } : {};
  }

  /** The album a track belongs to (FR-02.3), held only by the caller; undefined when there's no such track. */
  async parentAlbum(trackId: string): Promise<string | undefined> {
    const body = await this.get("Get Track", "tracks", trackId);
    return body === undefined ? undefined : trackSchema.parse(body).album.id;
  }

  private async get(call: Call, collection: string, id: string): Promise<unknown> {
    if (!spotifyId.test(id)) return undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      // A token refused once is fetched again, once.
      // oxlint-disable-next-line no-await-in-loop
      const token = await this.accessToken();
      // oxlint-disable-next-line no-await-in-loop
      const response = await this.send(call, `https://api.spotify.com/v1/${collection}/${id}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (response.status === 401 && attempt === 0) {
        void response.body?.cancel().catch(() => {});
        this.token = undefined;
        continue;
      }
      if (response.status === 404 || response.status === 400) {
        void response.body?.cancel().catch(() => {});
        return undefined;
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw new ProviderUnavailableError(
          "spotify",
          `Spotify answered ${response.status} to ${call}`,
        );
      }
      return response.json();
    }
    throw new ProviderUnavailableError("spotify", `Spotify refused its token for ${call}`);
  }

  /** The client-credentials token, fetched again a minute before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.expiresAt) return this.token.value;
    const { clientId, clientSecret } = this.options;
    const response = await this.send("the token", "https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ProviderUnavailableError(
        "spotify",
        `Spotify answered ${response.status} to the token`,
      );
    }
    const { access_token: value, expires_in: expiresIn } = tokenSchema.parse(await response.json());
    this.token = { value, expiresAt: this.now() + (expiresIn - 60) * 1_000 };
    return value;
  }

  /** One request in its turn, waiting out 429s as `Retry-After` asks. */
  private async send(call: Call, url: string, init: SafeFetchInit): Promise<Response> {
    for (let retry = 0; ; retry++) {
      // Each attempt waits its turn after the one before.
      // oxlint-disable-next-line no-await-in-loop
      await this.queue.turn();
      let response: Response;
      try {
        // oxlint-disable-next-line no-await-in-loop
        response = await this.fetch(url, init);
      } catch (error) {
        throw new ProviderUnavailableError("spotify", `Spotify didn't answer ${call}`, {
          cause: error,
        });
      }
      if (response.status !== 429) return response;
      void response.body?.cancel().catch(() => {});
      if (retry === spotifyMaxRetries) {
        throw new ProviderUnavailableError("spotify", `Spotify kept refusing ${call} as too many`);
      }
      this.queue.holdFor(
        Math.max(Number(response.headers.get("retry-after")) || 0, 2 ** retry) * 1_000,
      );
    }
  }
}
