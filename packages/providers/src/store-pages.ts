// Qobuz's and Tidal's album pages, as the G1 terms review permits them (TS-41): read only to identify a pasted link,
// transiently, at most two requests per Qobuz link and one per Tidal link, to www.qobuz.com and tidal.com only.
// Request A asks Qobuz's home store for the album with the slug "-" and reads only the redirect's `Location`;
// request B reads that page's schema.org title, artist and date as hints for step 4. Nothing from a page outlives
// the call: no cache, no log, no prefill. robots.txt is read at most once a day per host, and no album page is asked
// for while it disallows them. Requests to one host start a second apart.

import { z } from "zod";

import { serviceNames, type ProviderCache } from "@tonaris/domain";

import { clientParts, readBody, type ClientOptions } from "./client";
import { ProviderUnavailableError } from "./errors";
import type { Hints } from "./hints";
import { parseLink, type ParsedLink } from "./links";
import { PacedQueue } from "./paced-queue";
import { cachedValue } from "./provider-cache";
import { discard, type ProviderFetch } from "./safe-fetch";
import { qobuzHomeLocale } from "./services";

const qobuz = "https://www.qobuz.com";
const tidal = "https://tidal.com";
/** Requests to one host start at least this far apart: TS-41 sets no pace, so this keeps a batch polite. */
const storePageIntervalMs = 1_000;
/** How long a robots.txt answer holds (TS-41: checked daily). */
const robotsCacheMs = 86_400_000;
/** The product token robots.txt rules name (RFC 9309). */
const robotsAgent = "Tonaris";

export type StorePagesOptions = ClientOptions & { cache: ProviderCache };

/**
 * What request A found: the slug and store for step 2's store forms and request B, and the page itself when the slug
 * is "-".
 */
type QobuzAddress = { slug: string; locale: string; page?: string };

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
 * Whether robots.txt lets `agent` fetch `pathname` (RFC 9309): the groups naming the agent, else `*`; the longest
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
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current && value) {
      current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  const token = agent.toLowerCase();
  const named = groups.filter((group) => group.agents.includes(token));
  const applicable =
    named.length > 0 ? named : groups.filter((group) => group.agents.includes("*"));
  let best: { allow: boolean; length: number } | undefined;
  for (const rule of applicable.flatMap((group) => group.rules)) {
    if (!patternMatches(rule.pattern, pathname)) continue;
    const { length } = rule.pattern;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { allow: rule.allow, length };
    }
  }
  return best?.allow ?? true;
}

const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

/** Decodes the HTML entities pages use in attributes and, sometimes, in their JSON-LD strings. */
function decodeEntities(text: string): string {
  return text.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)));
    return entities[name.toLowerCase()] ?? whole;
  });
}

const blockSchema = z.object({
  "@type": z.unknown(),
  name: z.string().optional(),
  datePublished: z.string().optional(),
  releaseDate: z.string().optional(),
  brand: z.object({ name: z.string().optional() }).optional(),
  byArtist: z
    .union([
      z.object({ name: z.string().optional() }),
      z.array(z.object({ name: z.string().optional() })),
    ])
    .optional(),
});
type Block = z.infer<typeof blockSchema>;

/** The schema.org blocks of a page's JSON-LD scripts. Anything else on the page is ignored. */
function jsonLd(html: string): Block[] {
  const blocks: Block[] = [];
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
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      const block = blockSchema.safeParse(item);
      if (block.success) blocks.push(block.data);
    }
  }
  return blocks;
}

const text = (value: string | undefined) => decodeEntities(value ?? "").trim();
const hintsOf = (title: string, artist: string, date: string): Hints | undefined =>
  title && artist && /^\d{4}(-\d{2}){0,2}$/.test(date) ? { title, artist, date } : undefined;

/** A Qobuz page's hints: the `MusicAlbum` name, the `Product` block's brand as artist, and the date. */
export function extractQobuzHints(html: string): Hints | undefined {
  const blocks = jsonLd(html);
  const album = blocks.find((block) => block["@type"] === "MusicAlbum");
  const product = blocks.find((block) => block["@type"] === "Product");
  return hintsOf(
    text(album?.name) || text(product?.name),
    text(product?.brand?.name),
    (text(album?.datePublished) || text(product?.releaseDate)).slice(0, 10),
  );
}

/** A Tidal page's hints: the `MusicAlbum` name, its artists and its date. */
export function extractTidalHints(html: string): Hints | undefined {
  const album = jsonLd(html).find((block) => block["@type"] === "MusicAlbum");
  const artists = album?.byArtist === undefined ? [] : [album.byArtist].flat();
  return hintsOf(
    text(album?.name),
    artists
      .map((artist) => text(artist.name))
      .filter(Boolean)
      .join(", "),
    text(album?.datePublished).slice(0, 10),
  );
}

type Answer = { status: number; location: string | null; response: Response };

export class StorePages {
  private readonly cache: ProviderCache;
  private readonly fetch: ProviderFetch;
  private readonly now: () => number;
  private readonly queues: Record<"qobuz" | "tidal", PacedQueue>;

  constructor(options: StorePagesOptions) {
    const { fetch, clock } = clientParts(options);
    this.cache = options.cache;
    this.fetch = fetch;
    this.now = clock.now;
    this.queues = {
      qobuz: new PacedQueue(storePageIntervalMs, clock),
      tidal: new PacedQueue(storePageIntervalMs, clock),
    };
  }

  /**
   * Request A, for an open. or play. link: the album's slug, from the home store's redirect (decided 21 October
   * 2026), with that store. Only `Location` is read, unless the answer is the page itself (slug "-") and `readPage`
   * allows it, as request B. Undefined when the store has no such album, or robots.txt disallows album pages.
   */
  async qobuzAddress(
    albumId: string,
    { readPage }: { readPage: boolean },
  ): Promise<QobuzAddress | undefined> {
    if (!(await this.allowed("qobuz"))) return undefined;
    const locale = qobuzHomeLocale;
    const answer = await this.get("qobuz", `${qobuz}/${locale}/album/-/${albumId}`);
    if (answer.status === 200) {
      const page = readPage ? await readBody("qobuz", answer.response, "text") : undefined;
      if (!readPage) discard(answer.response);
      return { slug: "-", locale, ...(page === undefined ? {} : { page }) };
    }
    discard(answer.response);
    const target = qobuzAlbumPath(answer.location, albumId);
    return target ? { slug: target.slug, locale } : undefined;
  }

  /**
   * Request B: the hints on the album's page in `locale`'s store, the home store for a link without one, under
   * `slug`. A redirect to the same album, as a stale slug gets, is followed once.
   */
  async qobuzHints(
    albumId: string,
    slug: string,
    locale = qobuzHomeLocale,
  ): Promise<Hints | undefined> {
    if (!(await this.allowed("qobuz"))) return undefined;
    const page = await this.page(
      "qobuz",
      `${qobuz}/${locale}/album/${slug}/${albumId}`,
      (location) => qobuzAlbumPath(location, albumId)?.url,
    );
    return page === undefined ? undefined : extractQobuzHints(page);
  }

  /** Tidal's one request: the hints on `tidal.com/album/{id}`, for the server's region. A 404 has none. */
  async tidalHints(albumId: string): Promise<Hints | undefined> {
    if (!(await this.allowed("tidal"))) return undefined;
    const page = await this.page("tidal", `${tidal}/album/${albumId}`, (location) => {
      const target = redirectLink(location, tidal);
      return target?.link.kind === "album" && target.link.id === albumId ? target.url : undefined;
    });
    return page === undefined ? undefined : extractTidalHints(page);
  }

  /** A page's HTML, following one redirect `sameAlbum` approves; undefined for a 404 or another album. */
  private async page(
    store: "qobuz" | "tidal",
    url: string,
    sameAlbum: (location: string | null) => string | undefined,
  ): Promise<string | undefined> {
    let answer = await this.get(store, url);
    if (answer.status === 301 || answer.status === 302) {
      discard(answer.response);
      const target = sameAlbum(answer.location);
      if (!target) return undefined;
      answer = await this.get(store, target);
    }
    if (answer.status !== 200) {
      discard(answer.response);
      return undefined;
    }
    return readBody(store, answer.response, "text");
  }

  /**
   * One request in its host's turn, redirects read rather than followed. 404s answer; other 4xx and 5xx answers, as
   * every failure, throw as the store being unavailable (errors.ts).
   */
  private async get(store: "qobuz" | "tidal", url: string): Promise<Answer> {
    await this.queues[store].turn();
    let response: Response;
    try {
      response = await this.fetch(url, { redirect: "manual" });
    } catch (error) {
      throw new ProviderUnavailableError(store, `${serviceNames[store]} didn't answer`, {
        cause: error,
      });
    }
    if (response.status >= 400 && response.status !== 404) {
      discard(response);
      throw new ProviderUnavailableError(
        store,
        `${serviceNames[store]} answered ${response.status}`,
      );
    }
    return { status: response.status, location: response.headers.get("location"), response };
  }

  /** Whether robots.txt allows album pages, read at most once a day. One that can't be read allows nothing. */
  private async allowed(store: "qobuz" | "tidal"): Promise<boolean> {
    const origin = store === "qobuz" ? qobuz : tidal;
    const key = `robots:${new URL(origin).host}`;
    const kept = await cachedValue(this.cache, key, this.now());
    const parsed = z.object({ allowed: z.boolean() }).safeParse(kept);
    if (parsed.success) return parsed.data.allowed;

    await this.queues[store].turn();
    let robots: string;
    try {
      const response = await this.fetch(`${origin}/robots.txt`, {});
      if (!response.ok) {
        discard(response);
        return false;
      }
      robots = await response.text();
    } catch {
      return false;
    }
    const allowed = robotsAllows(
      robots,
      robotsAgent,
      store === "qobuz" ? `/${qobuzHomeLocale}/album/x/0` : "/album/0",
    );
    await this.cache.set([{ key, value: { allowed } }], new Date(this.now() + robotsCacheMs));
    return allowed;
  }
}

/**
 * A redirect's `Location`, read against `origin`, as the link it is (TS-40): one on another origin, or that isn't a
 * URL or an album or track link, leads nowhere.
 */
function redirectLink(
  location: string | null,
  origin: string,
): { url: string; link: ParsedLink } | undefined {
  if (location === null) return undefined;
  let url: URL;
  try {
    url = new URL(location, origin);
  } catch {
    return undefined;
  }
  if (url.origin !== origin) return undefined;
  const read = parseLink(url.href);
  return read.status === "parsed" ? { url: url.href, link: read.link } : undefined;
}

/** The slug and URL of a www.qobuz.com store link, `/{locale}/album/{slug}/{id}`, to the album asked about. */
function qobuzAlbumPath(
  location: string | null,
  albumId: string,
): { slug: string; url: string } | undefined {
  const target = redirectLink(location, qobuz);
  if (!target) return undefined;
  const { kind, id, locale, slug } = target.link;
  return kind === "album" && id === albumId && locale && slug
    ? { slug, url: target.url }
    : undefined;
}
