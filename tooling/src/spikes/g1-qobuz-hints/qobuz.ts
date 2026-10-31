// Qobuz's public store pages for the TON-99 spike: the two requests the G1 terms review permits (TON-17, decision
// 4), made as production would make them. Request A asks www.qobuz.com for the album with the slug "-" and reads
// only the redirect's `Location`, the album's slug. Request B fetches that page and reads three facts from its
// schema.org data: title, artist and date. Only www.qobuz.com is fetched, never open. or play., whose robots.txt
// disallow everything; requests send the honest User-Agent and follow no other links. Nothing is cached or kept:
// the HTML and the facts live only while a link is matched.

import { z } from "zod";

import type { Fetcher, ParsedLink, Service } from "../g1-musicbrainz/links";
import { userAgent } from "../g1-musicbrainz/musicbrainz";

const origin = "https://www.qobuz.com";

/** The hints a store page gives. Neither Qobuz nor Tidal shows a track count or a barcode. */
export type QobuzHints = {
  /** The schema.org `MusicAlbum` name: the title without Qobuz's version note, such as "(Deluxe Edition)". */
  title: string;
  /** The title as og:title shows it, with the version note. */
  fullTitle: string;
  /** The `Product` block's `brand.name`: `MusicAlbum` has no `byArtist`. */
  artist: string;
  /** `YYYY-MM-DD`. Some are coarse: `1970-01-01` stands for 1970. */
  date: string;
};

/** The hints of Qobuz's pages, and of the other stores whose pages give the same (TON-99, the Tidal spike). */
export type StoreHints = QobuzHints;

export type QobuzRequest = {
  /** YouTube Music's reads are the Data API's (TON-128): the playlist, its items and a video. */
  kind: "robots" | "slug" | "page" | "playlist" | "items" | "video";
  /** 0 when the request timed out. */
  status: number;
  /** From when the request was allowed to start until its body arrived. */
  ms: number;
};

export type PageRequest = QobuzRequest;

export type AlbumPage = {
  /** The slug the store redirected to, `-` for titles without Latin letters. */
  slug?: string;
  /** Whether the link lacked a slug, so request A ran. */
  slugRequested?: boolean;
  /** Requests this link took. */
  requests: number;
  hints?: QobuzHints;
  /** Why there are no hints. */
  problem?: string;
};

/** A store whose album pages give hints, one page per link. */
export type StorePages = {
  readonly service: Service;
  readonly requests: readonly PageRequest[];
  /** Whether robots.txt still allows album pages. If it stops, the requests stop (TS-41). */
  albumPagesAllowed(): Promise<boolean>;
  album(link: ParsedLink): Promise<AlbumPage>;
};

export type QobuzOptions = {
  fetch?: Fetcher;
  minIntervalMs?: number;
  /** How long a request may take, body included, before it is abandoned. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** Matches a robots.txt path pattern, where `*` is any run of characters and a final `$` anchors the end. */
function patternMatches(pattern: string, pathname: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(pathname);
}

/**
 * Whether robots.txt lets `agent` fetch `pathname` (RFC 9309): the group naming the agent, else `*`; the longest
 * matching rule wins, and Allow wins a tie.
 */
export function robotsAllows(robots: string, agent: string, pathname: string): boolean {
  type Group = { agents: string[]; rules: { allow: boolean; pattern: string }[] };
  const groups: Group[] = [];
  let current: Group | undefined;
  for (const raw of robots.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match?.[1]) continue;
    const field = match[1].toLowerCase();
    const value = (match[2] ?? "").trim();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  const token = agent.toLowerCase();
  const named = groups.filter((g) => g.agents.includes(token));
  const applicable = named.length > 0 ? named : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; length: number } | undefined;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!patternMatches(rule.pattern, pathname)) continue;
    const { length } = rule.pattern;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { allow: rule.allow, length };
    }
  }
  return best?.allow ?? true;
}

const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

/** Decodes the HTML entities a page uses in attributes and, sometimes, in its JSON-LD strings. */
export function decodeEntities(text: string): string {
  return text.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X"))
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return entities[name.toLowerCase()] ?? whole;
  });
}

/** The schema.org fields read from a JSON-LD block. Anything else in it is ignored. */
const blockSchema = z.object({
  "@type": z.unknown(),
  name: z.string().optional(),
  datePublished: z.string().optional(),
  releaseDate: z.string().optional(),
  brand: z.object({ name: z.string().optional() }).optional(),
});
type Block = z.infer<typeof blockSchema>;
const text = (value: string | undefined) => decodeEntities(value ?? "").trim();

/** The page's title, artist and date, from its schema.org `Product` and `MusicAlbum` blocks and og:title. */
export function extractHints(html: string): QobuzHints | undefined {
  const blocks: Block[] = [];
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed: unknown = JSON.parse(match[1] ?? "");
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        const block = blockSchema.safeParse(item);
        if (block.success) blocks.push(block.data);
      }
    } catch {
      // A block that isn't JSON says nothing about the album.
    }
  }
  const album = blocks.find((b) => b["@type"] === "MusicAlbum");
  const product = blocks.find((b) => b["@type"] === "Product");
  const title = text(album?.name) || text(product?.name);
  const artist = text(product?.brand?.name);
  const date = (text(album?.datePublished) || text(product?.releaseDate)).slice(0, 10);
  if (!title || !artist || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;

  // og:title reads "{title with version}, {artist} - Qobuz".
  const og = /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/.exec(html)?.[1];
  const shown = og ? decodeEntities(og).replace(/\s+-\s+Qobuz\s*$/, "") : "";
  const fullTitle = shown.endsWith(`, ${artist}`) ? shown.slice(0, -`, ${artist}`.length) : title;
  return { title, fullTitle, artist, date };
}

/** The slug and id of a www.qobuz.com album path, `/{locale}/album/{slug}/{id}`. */
function albumPath(location: string, albumId: string): { slug: string; url: string } | undefined {
  const url = new URL(location, origin);
  if (url.origin !== origin) return undefined;
  const slug = new RegExp(`^/[a-z]{2}-[a-z]{2}/album/([^/]+)/${albumId}$`).exec(url.pathname)?.[1];
  return slug ? { slug, url: url.href } : undefined;
}

type Answer = { status: number; location: string | null; body: string };

/**
 * Paced GETs with redirects off, timed to the end of their bodies, with Tonaris's User-Agent. A stalled connection
 * once held a run for minutes, so a request that takes longer than the timeout is recorded with status 0 and throws.
 */
export class PacedGet {
  readonly requests: PageRequest[] = [];
  private nextStart = 0;

  constructor(private readonly options: QobuzOptions = {}) {}

  async get(kind: PageRequest["kind"], url: string): Promise<Answer> {
    const wait = this.nextStart - performance.now();
    if (wait > 0) await (this.options.sleep ?? Bun.sleep)(wait);
    const startedAt = performance.now();
    this.nextStart = startedAt + (this.options.minIntervalMs ?? 2_000);
    const timeoutMs = this.options.timeoutMs ?? 15_000;
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        redirect: "manual",
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.text();
      this.requests.push({ kind, status: response.status, ms: performance.now() - startedAt });
      return { status: response.status, location: response.headers.get("location"), body };
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "TimeoutError")) throw error;
      this.requests.push({ kind, status: 0, ms: performance.now() - startedAt });
      throw new Error(`${new URL(url).hostname} didn't answer within ${timeoutMs / 1000} s`, {
        cause: error,
      });
    }
  }
}

export class Qobuz implements StorePages {
  readonly service = "qobuz";
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
    return robotsAllows(body, "Tonaris", "/us-en/album/-/0");
  }

  /**
   * Requests A and B for one link. A store link already has its slug, so it goes straight to its page; a stale
   * slug redirects once. An open. or play. link asks `/us-en/album/-/{id}`, whose redirect names the slug and the
   * page. A title with no Latin letters has the slug "-", so that answer is the page itself.
   */
  async album(link: ParsedLink): Promise<AlbumPage> {
    const albumId = link.albumId ?? "";
    let answer = link.slug
      ? await this.http.get(
          "page",
          `${origin}/${link.locale ?? "us-en"}/album/${link.slug}/${albumId}`,
        )
      : await this.http.get("slug", `${origin}/us-en/album/-/${albumId}`);
    let requests = 1;
    let slug = link.slug ?? (answer.status === 200 ? "-" : undefined);
    if (answer.status === 301 || answer.status === 302) {
      const target = albumPath(answer.location ?? "", albumId);
      if (!target)
        return { requests, problem: `a redirect away from the album (${answer.status})` };
      slug = target.slug;
      answer = await this.http.get("page", target.url);
      requests++;
    }
    const found = {
      ...(slug && { slug }),
      requests,
      ...(!link.slug && { slugRequested: true }),
    };
    if (answer.status !== 200) return { ...found, problem: `the page answered ${answer.status}` };
    const hints = extractHints(answer.body);
    return hints
      ? { ...found, hints }
      : { ...found, problem: "no title, artist and date on the page" };
  }
}
