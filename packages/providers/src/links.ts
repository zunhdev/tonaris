// Step 0 of the identification chain (TS-41): pasted text, parsed locally against an allowlist (TS-40, Q-05).
// Nothing here fetches, except `resolveShortLink()`, and only through the fetcher its caller passes. It imports
// only the domain and the services' table, so browsers can parse pasted links too, through
// `@tonaris/providers/links`.

import {
  failure,
  maxLinkLength,
  serviceNames,
  streamingServices,
  type Failure,
  type LinkKind,
  type LinkRef,
  type StreamingService,
} from "@tonaris/domain";

import { appleStorefront, qobuzLocale, services } from "./services";

/** A recognised link: what it names, what it tells of the album, and its canonical URL (TS-40). */
export type ParsedLink = LinkRef & {
  /** The album's id, when the link names it: album links, Apple Music `?i=` song links and YouTube Music tracks. */
  albumId?: string;
  /** Apple Music's storefront, such as `fi`, when the link has one. */
  storefront?: string;
  /** A Qobuz store link's store, such as `gb-en`, when it has one. */
  locale?: string;
  /** A Qobuz store link's slug, which request A needs (TS-41). */
  slug?: string;
  url: string;
};

export type LinkParse =
  | { status: "parsed"; link: ParsedLink }
  /** A short link of `service`'s, for `resolveShortLink()` to follow. */
  | { status: "short"; service: StreamingService; url: string }
  /** `unsupported_link`, or `provider_unavailable` when a short link couldn't be followed (TS-27). */
  | { status: "failed"; failure: Failure };

/** A short link's requests, at most (TS-40). */
export const maxShortLinkHops = 3;

/** Each host's service, from the services' table. A Map, so a host such as `constructor` finds nothing. */
const hostServices = (hosts: (service: StreamingService) => readonly string[]) =>
  new Map(
    streamingServices.flatMap((service) => hosts(service).map((host) => [host, service] as const)),
  );
const linkHosts = hostServices((service) => services[service].hosts);
const shortLinkHosts = hostServices((service) => services[service].shortLinkHosts);

/**
 * Whether `host` is one the services' links or short links are on, such as `open.spotify.com` or `spotify.link`:
 * for a pasted line without its scheme. Whether the link is supported is `parseLink()`'s to say.
 */
export function isLinkHost(host: string): boolean {
  const name = host.toLowerCase();
  return linkHosts.has(name) || shortLinkHosts.has(name);
}

const names = streamingServices.map((service) => serviceNames[service]);
const notALink = `This doesn't look like a ${names.slice(0, -1).join(", ")} or ${names.at(-1)} album or track link.`;

function unsupported(detail: string): Extract<LinkParse, { status: "failed" }> {
  return { status: "failed", failure: failure("unsupported_link", detail) };
}

function notAlbumOrTrack(service: StreamingService): LinkParse {
  return unsupported(`Only ${serviceNames[service]} album and track links can be added.`);
}

function incomplete(service: StreamingService): LinkParse {
  const name = serviceNames[service];
  return unsupported(`This ${name} link looks incomplete. Copy it again from ${name}.`);
}

function parsed(link: ParsedLink): LinkParse {
  return { status: "parsed", link };
}

function linkKind(segment: string | undefined): LinkKind | undefined {
  const kind = segment?.toLowerCase();
  return kind === "album" || kind === "track" ? kind : undefined;
}

/** The fields an album link adds: the album is what it names. */
const albumOf = (kind: LinkKind, id: string) => (kind === "album" ? { albumId: id } : {});

function spotify(kind: LinkKind | undefined, id: string | undefined, rest: string[]): LinkParse {
  if (!kind) return notAlbumOrTrack("spotify");
  if (!id || rest.length > 0 || !services.spotify.ids[kind].test(id)) return incomplete("spotify");
  return parsed({
    service: "spotify",
    kind,
    id,
    ...albumOf(kind, id),
    url: services.spotify.canonical(kind, id),
  });
}

/** `spotify:album:{id}` and `spotify:track:{id}`. */
function spotifyUri(text: string): LinkParse {
  const [, kind, id, ...rest] = text.split(":");
  return spotify(linkKind(kind), id, rest);
}

/** `(/intl-{xx})?/(album|track)/{id}`; every query parameter, `si` included, is dropped. */
function spotifyUrl(segments: string[]): LinkParse {
  const [kind, id, ...rest] = segments[0]?.toLowerCase().startsWith("intl-")
    ? segments.slice(1)
    : segments;
  return spotify(linkKind(kind), id, rest);
}

/**
 * `(/{sf})?/album(/{slug})?/{id}`, a song with `?i=`, and `(/{sf})?/song(/{slug})?/{id}`. The storefront stays
 * as pasted, and a link without one stays without, so Apple picks the store.
 */
function appleMusic(segments: string[], query: URLSearchParams): LinkParse {
  const { ids, canonical } = services["apple-music"];
  const sf =
    segments[0] && appleStorefront.test(segments[0]) ? segments[0].toLowerCase() : undefined;
  const [section, ...tail] = sf ? segments.slice(1) : segments;
  const kind = section?.toLowerCase();
  if (kind !== "album" && kind !== "song") return notAlbumOrTrack("apple-music");
  const id = tail.at(-1);
  if (!id || tail.length > 2 || !ids[kind === "album" ? "album" : "track"].test(id)) {
    return incomplete("apple-music");
  }
  const where = sf ? { storefront: sf } : {};
  if (kind === "song") {
    return parsed({
      service: "apple-music",
      kind: "track",
      id,
      ...where,
      url: canonical("track", id, where),
    });
  }
  const song = query.get("i");
  if (song === null) {
    return parsed({
      service: "apple-music",
      kind: "album",
      id,
      albumId: id,
      ...where,
      url: canonical("album", id, where),
    });
  }
  if (!ids.track.test(song)) return incomplete("apple-music");
  return parsed({
    service: "apple-music",
    kind: "track",
    id: song,
    albumId: id,
    ...where,
    url: canonical("track", song, { ...where, albumId: id }),
  });
}

/**
 * Store links, `(/{locale})?/album/{slug}/{id}`; `open.` and `play.` links, `/(album|track)/{id}`. All open
 * through `open.qobuz.com`, which hands over to the app (FR-06.6). Ids are base 36, so case carries nothing.
 */
function qobuz(host: string, segments: string[]): LinkParse {
  const { ids, canonical } = services.qobuz;
  if (host === "open.qobuz.com" || host === "play.qobuz.com") {
    const [section, id, ...rest] = segments;
    const kind = linkKind(section);
    if (!kind) return notAlbumOrTrack("qobuz");
    if (!id || rest.length > 0 || !ids[kind].test(id)) return incomplete("qobuz");
    const key = id.toLowerCase();
    return parsed({
      service: "qobuz",
      kind,
      id: key,
      ...albumOf(kind, key),
      url: canonical(kind, key),
    });
  }
  const locale =
    segments[0] && qobuzLocale.test(segments[0]) ? segments[0].toLowerCase() : undefined;
  const [section, slug, id, ...rest] = locale ? segments.slice(1) : segments;
  if (section?.toLowerCase() !== "album") return notAlbumOrTrack("qobuz");
  if (!slug || !id || rest.length > 0 || !ids.album.test(id)) return incomplete("qobuz");
  const key = id.toLowerCase();
  return parsed({
    service: "qobuz",
    kind: "album",
    id: key,
    albumId: key,
    ...(locale ? { locale } : {}),
    slug,
    url: canonical("album", key),
  });
}

/** `(/browse)?/(album|track)/{id}`, with a share link's `/u` and `?u` dropped. */
function tidal(segments: string[]): LinkParse {
  const path = segments[0]?.toLowerCase() === "browse" ? segments.slice(1) : segments;
  const [section, id, ...rest] = path.at(-1)?.toLowerCase() === "u" ? path.slice(0, -1) : path;
  const kind = linkKind(section);
  if (!kind) return notAlbumOrTrack("tidal");
  if (!id || rest.length > 0 || !services.tidal.ids[kind].test(id)) return incomplete("tidal");
  return parsed({
    service: "tidal",
    kind,
    id,
    ...albumOf(kind, id),
    url: services.tidal.canonical(kind, id),
  });
}

/**
 * `/playlist?list={album}` and `/watch?v={video}&list={album}`, where an album is an auto-generated `OLAK5uy_…`
 * playlist. A track stands for its album, so both keep the album's playlist as the link (TON-131). Any other YouTube
 * address, such as a video alone or the web player's `/browse/MPREb_…`, names no album a public API can find.
 */
function youtubeMusic(segments: string[], query: URLSearchParams): LinkParse {
  const { ids, canonical } = services["youtube-music"];
  const [section, ...rest] = segments;
  const list = query.get("list");
  const video = query.get("v");
  const known = rest.length === 0 && (section === "playlist" || section === "watch");
  if (!known || list === null || (section === "watch" && video === null)) {
    return unsupported(
      "This YouTube link doesn't name an album. In YouTube Music, open the album and copy its link from Share.",
    );
  }
  if (!list.startsWith("OLAK5uy_")) {
    return unsupported(
      "This YouTube playlist isn't an album. In YouTube Music, open the album and copy its link from Share.",
    );
  }
  if (!ids.album.test(list)) return incomplete("youtube-music");
  if (section === "playlist") {
    return parsed({
      service: "youtube-music",
      kind: "album",
      id: list,
      albumId: list,
      url: canonical("album", list),
    });
  }
  if (!video || !ids.track.test(video)) return incomplete("youtube-music");
  return parsed({
    service: "youtube-music",
    kind: "track",
    id: video,
    albumId: list,
    url: canonical("track", video, { albumId: list }),
  });
}

/** Each service's parser, for a URL on one of its hosts, split into its path's segments. */
const parsers: Record<StreamingService, (url: URL, segments: string[]) => LinkParse> = {
  spotify: (_url, segments) => spotifyUrl(segments),
  "apple-music": (url, segments) => appleMusic(segments, url.searchParams),
  qobuz: (url, segments) => qobuz(url.hostname, segments),
  tidal: (_url, segments) => tidal(segments),
  "youtube-music": (url, segments) => youtubeMusic(segments, url.searchParams),
};

/**
 * Parses one pasted link (TS-40). It fetches nothing: a short link comes back as `short`, with its service, for
 * `resolveShortLink()`. Input that isn't an album or track link of the five services fails with `unsupported_link`
 * and a reason (FR-02.3).
 */
export function parseLink(input: string): LinkParse {
  const text = input.trim();
  if (text === "" || text.length > maxLinkLength) return unsupported(notALink);
  if (text.toLowerCase().startsWith("spotify:")) return spotifyUri(text);

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return unsupported(notALink);
  }
  // Credentials would be stored and shown; another port isn't the service.
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.port
  ) {
    return unsupported(notALink);
  }
  const shortOf = shortLinkHosts.get(url.hostname);
  if (shortOf) {
    url.protocol = "https:";
    url.hash = "";
    return { status: "short", service: shortOf, url: url.href };
  }

  const service = linkHosts.get(url.hostname);
  if (!service) return unsupported(notALink);
  return parsers[service](url, url.pathname.split("/").filter(Boolean));
}

/** The part of `fetch` the resolver uses. Production passes `safeFetch` (TS-103). */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Follows a short link the way TS-40 allows: one `GET` per hop with redirects read rather than followed, at most
 * 3 hops, and every `Location` on the allowlist: another of the service's short links, or one of its links, which
 * ends the walk. No other host is ever requested, so a URL that isn't a short link isn't followed. The fetcher is
 * required, so no caller can leave out the SSRF guard (TS-103) by omission.
 */
export async function resolveShortLink(
  url: string,
  fetcher: Fetcher,
): Promise<Exclude<LinkParse, { status: "short" }>> {
  let start: URL;
  try {
    start = new URL(url);
  } catch {
    return unsupported(notALink);
  }
  const service = shortLinkHosts.get(start.hostname);
  if (!service) return unsupported(notALink);
  // Functions rather than constants, so no caller can change another's failure.
  const name = serviceNames[service];
  const deadEnd = () => unsupported(`This ${name} short link doesn't lead to an album or track.`);
  const unreachable = (): Extract<LinkParse, { status: "failed" }> => ({
    status: "failed",
    failure: failure(
      "provider_unavailable",
      `Couldn't reach ${name} to open this short link. Try again.`,
    ),
  });

  let current = url;
  for (let hop = 0; hop < maxShortLinkHops; hop++) {
    let response: Response;
    try {
      // Each hop depends on the previous one's Location.
      // oxlint-disable-next-line no-await-in-loop
      response = await fetcher(current, { redirect: "manual" });
    } catch {
      return unreachable();
    }
    // Only the status and Location matter. Not safe-fetch's `discard()`: this module runs in browsers too.
    void response.body?.cancel().catch(() => {});
    if (response.status >= 500 || response.status === 429) return unreachable();
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return deadEnd();

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return deadEnd();
    }
    if (shortLinkHosts.get(next.hostname) === service) {
      if (next.protocol !== "https:" || next.username || next.password || next.port)
        return deadEnd();
      next.hash = "";
      current = next.href;
      continue;
    }
    if (linkHosts.get(next.hostname) !== service) return deadEnd();
    const target = parseLink(next.href);
    return target.status === "parsed" ? target : deadEnd();
  }
  return deadEnd();
}

/**
 * Reads pasted text as a link (TS-40): parsed locally, and a short link followed through `fetcher`. Capture's
 * identification starts here (TS-41 step 0), and so does a link edit (TON-46).
 */
export async function readLink(
  input: string,
  fetcher: Fetcher,
): Promise<Exclude<LinkParse, { status: "short" }>> {
  const read = parseLink(input);
  return read.status === "short" ? resolveShortLink(read.url, fetcher) : read;
}
