// Tidal's public album pages for the G1 Tidal spike: the store-page hints the creator chose for Tidal on
// 20 October 2026, under Qobuz's rules (TON-17, decision 4). One request per link, to tidal.com only, with the
// honest User-Agent; robots.txt is checked first; no other link is followed and nothing is cached or kept. Tidal's
// API isn't used: its developer terms forbid combining its content with other services, sending it to another
// service and any use with AI, without Tidal's written approval.

import { z } from "zod";

import type { ParsedLink } from "../g1-musicbrainz/links";
import { decodeEntities, PacedGet, type QobuzOptions, robotsAllows } from "../g1-qobuz-hints/qobuz";
import type { AlbumPage, PageRequest, StoreHints, StorePages } from "../g1-qobuz-hints/qobuz";

const origin = "https://tidal.com";

const artistSchema = z.object({ name: z.string().optional() });
const albumSchema = z.object({
  "@type": z.literal("MusicAlbum"),
  name: z.string().optional(),
  byArtist: z.union([artistSchema, z.array(artistSchema)]).optional(),
  datePublished: z.string().optional(),
});

/**
 * The page's title, artists and date, from its schema.org `MusicAlbum` block. Tidal keeps edition notes in the
 * name itself and shows no separate version, so `fullTitle` is the name too.
 */
export function extractTidalHints(html: string): StoreHints | undefined {
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch {
      // A block that isn't JSON says nothing about the album.
      continue;
    }
    const album = albumSchema.safeParse(parsed);
    if (!album.success) continue;
    const { name, byArtist, datePublished } = album.data;
    const title = decodeEntities(name ?? "").trim();
    const artists = (Array.isArray(byArtist) ? byArtist : byArtist ? [byArtist] : [])
      .map((artist) => decodeEntities(artist.name ?? "").trim())
      .filter(Boolean);
    const date = (datePublished ?? "").slice(0, 10);
    if (!title || artists.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
    return { title, fullTitle: title, artist: artists.join(", "), date };
  }
  return undefined;
}

/** A tidal.com album path, `/album/{id}` with an optional `/browse`, for the album asked about. */
function isAlbumPath(location: string, albumId: string): string | undefined {
  const url = new URL(location, origin);
  if (url.origin !== origin) return undefined;
  return new RegExp(`^(/browse)?/album/${albumId}/?$`).test(url.pathname) ? url.href : undefined;
}

export class Tidal implements StorePages {
  readonly service = "tidal";
  private readonly http: PacedGet;

  constructor(options: QobuzOptions = {}) {
    this.http = new PacedGet(options);
  }

  get requests(): readonly PageRequest[] {
    return this.http.requests;
  }

  async albumPagesAllowed(): Promise<boolean> {
    const { status, body } = await this.http.get("robots", `${origin}/robots.txt`);
    if (status !== 200) throw new Error(`robots.txt answered ${status}`);
    return robotsAllows(body, "Tonaris", "/album/0");
  }

  /** The album's page, `https://tidal.com/album/{id}`. A redirect to the same album is followed once. */
  async album(link: ParsedLink): Promise<AlbumPage> {
    const albumId = link.albumId ?? "";
    let answer = await this.http.get("page", `${origin}/album/${albumId}`);
    let requests = 1;
    if (answer.status === 301 || answer.status === 302) {
      const target = isAlbumPath(answer.location ?? "", albumId);
      if (!target)
        return { requests, problem: `a redirect away from the album (${answer.status})` };
      answer = await this.http.get("page", target);
      requests++;
    }
    if (answer.status !== 200) return { requests, problem: `the page answered ${answer.status}` };
    const hints = extractTidalHints(answer.body);
    return hints
      ? { requests, hints }
      : { requests, problem: "no title, artist and date on the page" };
  }
}
