// YouTube Music's hints for TS-41 step 4, from the YouTube Data API, since YouTube's terms forbid reading its pages
// automatically (TON-128). An album is an auto-generated playlist, `OLAK5uy_…`. At most three reads per link, with
// the key the creator's Tonaris-only Google account owns (TS-105):
// - `playlists.list`: the title, without a leading "Album - ", and the track count;
// - `playlistItems.list`: the artist, from the first track on a "{artist} - Topic" channel;
// - `videos.list` of that track: the date, from the distributor's "Released on:", else its "℗" year.
// The Developer Policies keep API data 30 days at most; Tonaris keeps none. Nothing here is cached, and what a read
// gives lives only in the caller's variables, for the MusicBrainz search. The key travels in a header, so it is in
// no URL, log or error.

import { z } from "zod";

import type { Hints } from "./hints";
import { PacedQueue, realClock } from "./paced-queue";
import { ProviderUnavailableError } from "./provider-cache";
import { safeFetch, type SafeFetchInit } from "./safe-fetch";

const api = "https://www.googleapis.com/youtube/v3";
/** Reads start at least this far apart: the spike saw no throttling at this pace. */
export const youtubeIntervalMs = 250;

export type YouTubeDataOptions = {
  apiKey: string;
  fetch?: (url: string, init: SafeFetchInit) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Told of a refused read (a 400 or 403: a used-up quota, a bad key), with the API's reason and never the key. */
  onRefused?: (read: Read, status: number, reason: string | undefined) => void;
};

/** What YouTube says about an album: step 4's hints, and the playlist's track count. */
export type YouTubeHints = Hints & { tracks: number };

type Read = "playlists" | "playlistItems" | "videos";

const playlistsSchema = z.object({
  items: z
    .array(
      z.object({
        snippet: z.object({ title: z.string() }),
        contentDetails: z.object({ itemCount: z.number() }),
      }),
    )
    .default([]),
});
const itemsSchema = z.object({
  items: z
    .array(
      z.object({
        snippet: z.object({ videoOwnerChannelTitle: z.string().optional() }),
        contentDetails: z.object({ videoId: z.string() }),
      }),
    )
    .default([]),
});
const videosSchema = z.object({
  items: z
    .array(z.object({ snippet: z.object({ description: z.string().default("") }) }))
    .default([]),
});
const errorSchema = z.object({
  error: z.object({ errors: z.array(z.object({ reason: z.string() })).default([]) }),
});

/** The album's title from its playlist's, without the "Album - " YouTube Music often puts first. */
export const albumTitle = (playlist: string) =>
  playlist.replace(/^(?:Album|EP|Single) - /, "").trim();

/** The artist a "- Topic" channel is for. */
export const topicArtist = (channel: string | undefined) =>
  channel?.endsWith(" - Topic") ? channel.slice(0, -" - Topic".length).trim() : undefined;

/** A distributor's description's date: "Released on: {date}", else the "℗ {year}" line's year. */
export function descriptionDate(description: string): string | undefined {
  if (!description.trimStart().startsWith("Provided to YouTube by")) return undefined;
  const released = /^Released on: (\d{4}-\d{2}-\d{2})\s*$/m.exec(description)?.[1];
  return released ?? /^℗ (\d{4})\b/m.exec(description)?.[1];
}

export class YouTubeData {
  private readonly options: YouTubeDataOptions;
  private readonly fetch: NonNullable<YouTubeDataOptions["fetch"]>;
  private readonly queue: PacedQueue;

  constructor(options: YouTubeDataOptions) {
    const { fetch = safeFetch, now = realClock.now, sleep = realClock.sleep } = options;
    this.options = options;
    this.fetch = fetch;
    this.queue = new PacedQueue(youtubeIntervalMs, { now, sleep });
  }

  /**
   * The album playlist's hints, or undefined when it gives none: unavailable, refused, no track on a "- Topic"
   * channel, or no date in that track's description.
   */
  async albumHints(playlistId: string): Promise<YouTubeHints | undefined> {
    const list = encodeURIComponent(playlistId);
    const playlists = await this.read("playlists", `part=snippet,contentDetails&id=${list}`);
    const [playlist] = playlists === undefined ? [] : playlistsSchema.parse(playlists).items;
    if (!playlist) return undefined;
    const items = await this.read(
      "playlistItems",
      `part=snippet,contentDetails&maxResults=50&playlistId=${list}`,
    );
    const topic = (items === undefined ? [] : itemsSchema.parse(items).items).find((item) =>
      topicArtist(item.snippet.videoOwnerChannelTitle),
    );
    const artist = topicArtist(topic?.snippet.videoOwnerChannelTitle);
    if (!topic || !artist) return undefined;
    const videos = await this.read(
      "videos",
      `part=snippet&id=${encodeURIComponent(topic.contentDetails.videoId)}`,
    );
    const [video] = videos === undefined ? [] : videosSchema.parse(videos).items;
    const date = descriptionDate(video?.snippet.description ?? "");
    const title = albumTitle(playlist.snippet.title);
    if (!date || !title) return undefined;
    return { title, artist, date, tracks: playlist.contentDetails.itemCount };
  }

  /** One read in its turn: its body, or undefined when it was refused or found nothing. */
  private async read(read: Read, query: string): Promise<unknown> {
    await this.queue.turn();
    let response: Response;
    try {
      response = await this.fetch(`${api}/${read}?${query}`, {
        headers: { "x-goog-api-key": this.options.apiKey },
      });
    } catch (error) {
      throw new ProviderUnavailableError("youtube", `YouTube didn't answer ${read}`, {
        cause: error,
      });
    }
    if (response.status === 429 || response.status >= 500) {
      void response.body?.cancel().catch(() => {});
      throw new ProviderUnavailableError(
        "youtube",
        `YouTube answered ${response.status} to ${read}`,
      );
    }
    if (response.status === 400 || response.status === 403) {
      const body = errorSchema.safeParse(await response.json().catch(() => undefined));
      this.options.onRefused?.(read, response.status, body.data?.error.errors[0]?.reason);
      return undefined;
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return undefined;
    }
    try {
      const body: unknown = await response.json();
      return body;
    } catch (error) {
      throw new ProviderUnavailableError("youtube", `YouTube's answer to ${read} broke off`, {
        cause: error,
      });
    }
  }
}
