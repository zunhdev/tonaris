// YouTube Music's hints for the G1 spike on YouTube Music links (TON-128), from the YouTube Data API, since YouTube's
// terms forbid reading its pages automatically. An album is an auto-generated playlist, `OLAK5uy_…`. Three reads
// per link, with the API key from YOUTUBE_API_KEY, never logged:
//
// - `playlists.list`: the playlist's title is the album's, often after "Album - " (or "EP - ", "Single - "), which
//   is dropped. Its channel is "YouTube", not the artist.
// - `playlistItems.list`: the tracks; their channel is usually "{artist} - Topic", sometimes the artist's VEVO.
// - `videos.list` for the first "- Topic" track: its description, written by the distributor, reads
//   "Provided to YouTube by …", "{track} · {artist} · {artist}", the album, "℗ {year} …" and "Released on: {date}".
//   The date comes from there; the artist from the "- Topic" channel, the album's, since the description credits
//   the track's, features included. The description's artists stand in only without a channel name.
//
// Nothing is cached or kept (the Developer Policies keep API data 30 days at most); the facts go only into the
// MusicBrainz search, as a store page's do.

import { z } from "zod";

import type { Fetcher, ParsedLink } from "../g1-musicbrainz/links";
import type { AlbumPage, PageRequest, StoreHints, StorePages } from "../g1-qobuz-hints/qobuz";

const api = "https://www.googleapis.com/youtube/v3";

const playlistsSchema = z.object({
  items: z.array(z.object({ snippet: z.object({ title: z.string() }) })).default([]),
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

/** What a distributor's description says: the credited artists and the release date, or the ℗ year. */
export function descriptionFacts(description: string): { artists?: string[]; date?: string } {
  const lines = description.split("\n").map((line) => line.trim());
  if (!lines[0]?.startsWith("Provided to YouTube by")) return {};
  // "{track} · {artist} · {artist}": the first line after the provider with a middle dot.
  const credits = lines.slice(1).find((line) => line.includes(" · "));
  const artists = credits
    ?.split(" · ")
    .slice(1)
    .map((name) => name.trim())
    .filter(Boolean);
  const released = /^Released on: (\d{4}-\d{2}-\d{2})$/m.exec(description)?.[1];
  const phonogram = /^℗ (\d{4})\b/m.exec(description)?.[1];
  const date = released ?? (phonogram ? `${phonogram}-01-01` : undefined);
  return { ...(artists?.length ? { artists } : {}), ...(date ? { date } : {}) };
}

/** The album's title from its playlist's, without the "Album - " YouTube Music often puts first. */
export const albumTitle = (playlist: string) =>
  playlist.replace(/^(Album|EP|Single) - /, "").trim();

/** The artist a "- Topic" channel is for. */
const topicArtist = (channel: string | undefined) =>
  channel?.endsWith(" - Topic") ? channel.slice(0, -" - Topic".length) : undefined;

export type YouTubeOptions = {
  key?: string;
  fetch?: Fetcher;
  minIntervalMs?: number;
  timeoutMs?: number;
};

export class YouTubeMusic implements StorePages {
  readonly service = "youtube-music";
  readonly requests: PageRequest[] = [];
  private nextStart = 0;

  constructor(private readonly options: YouTubeOptions = {}) {}

  /** The Data API has no robots.txt: its terms, reviewed in TON-128, are what allow it. */
  albumPagesAllowed(): Promise<boolean> {
    return Promise.resolve(true);
  }

  private async read(kind: PageRequest["kind"], path: string): Promise<unknown> {
    const key = this.options.key ?? process.env.YOUTUBE_API_KEY;
    if (!key) throw new Error("Set YOUTUBE_API_KEY in the root .env (TON-128).");
    const wait = this.nextStart - performance.now();
    if (wait > 0) await Bun.sleep(wait);
    const startedAt = performance.now();
    this.nextStart = startedAt + (this.options.minIntervalMs ?? 250);
    try {
      const response = await (this.options.fetch ?? fetch)(`${api}/${path}&key=${key}`, {
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
      });
      const body: unknown = await response.json();
      this.requests.push({ kind, status: response.status, ms: performance.now() - startedAt });
      // The key never reaches an error message: only the status and the API's reason.
      if (!response.ok) throw new Error(`the Data API answered ${response.status} to ${kind}`);
      return body;
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        this.requests.push({ kind, status: 0, ms: performance.now() - startedAt });
        throw new Error(`the Data API's ${kind} read timed out`, { cause: error });
      }
      throw error;
    }
  }

  async album(link: ParsedLink): Promise<AlbumPage> {
    const list = link.albumId ?? "";
    const [playlist] = playlistsSchema.parse(
      await this.read("playlist", `playlists?part=snippet&id=${list}`),
    ).items;
    if (!playlist) return { requests: 1, problem: "the playlist isn't available" };
    const items = itemsSchema.parse(
      await this.read(
        "items",
        `playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${list}`,
      ),
    ).items;
    const topic = items.find((item) => topicArtist(item.snippet.videoOwnerChannelTitle));
    if (!topic) return { requests: 2, problem: 'no track is on a "- Topic" channel' };
    const [video] = videosSchema.parse(
      await this.read("video", `videos?part=snippet&id=${topic.contentDetails.videoId}`),
    ).items;
    const facts = descriptionFacts(video?.snippet.description ?? "");
    const artist =
      topicArtist(topic.snippet.videoOwnerChannelTitle) ?? facts.artists?.join(", ") ?? "";
    const title = albumTitle(playlist.snippet.title);
    if (!facts.date) return { requests: 3, problem: "the description gives no date" };
    const hints: StoreHints = { title, fullTitle: title, artist, date: facts.date };
    return { requests: 3, hints };
  }
}
