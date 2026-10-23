// Step 0 of the identification chain (TS-41): pasted text, parsed locally against an allowlist (TS-40, Q-05).
// Nothing here fetches, except `resolveShortLink()`, and only through the fetcher its caller passes. It imports
// only the domain, so browsers can parse pasted links too, through `@tonaris/providers/links`.

import {
  failure,
  serviceNames,
  type Failure,
  type LinkKind,
  type LinkRef,
  type StreamingService,
} from "@tonaris/domain";

/** A recognised link: what it names, what it tells of the album, and its canonical URL (TS-40). */
export type ParsedLink = LinkRef & {
  /** The album's id, when the link names it: album links, and Apple Music `?i=` song links. */
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
  /** A short link, for `resolveShortLink()` to follow. */
  | { status: "short"; url: string }
  /** `unsupported_link`, or `provider_unavailable` when a short link couldn't be followed (TS-27). */
  | { status: "failed"; failure: Failure };

/** Longer input isn't a link anyone pasted. */
export const maxLinkLength = 2_048;

/** A short link's requests, at most (TS-40). */
export const maxShortLinkHops = 3;

// A Map, so a host such as `constructor` finds nothing.
const linkHosts = new Map<string, StreamingService>([
  ["open.spotify.com", "spotify"],
  ["music.apple.com", "apple-music"],
  ["geo.music.apple.com", "apple-music"],
  ["www.qobuz.com", "qobuz"],
  ["qobuz.com", "qobuz"],
  ["open.qobuz.com", "qobuz"],
  ["play.qobuz.com", "qobuz"],
  ["tidal.com", "tidal"],
  ["www.tidal.com", "tidal"],
  ["listen.tidal.com", "tidal"],
]);
const shortLinkHosts = new Set(["spotify.link", "spotify.app.link"]);

const spotifyId = /^[0-9A-Za-z]{22}$/;
const digits = /^\d+$/;
const qobuzId = /^[0-9a-z]+$/i;
const storefront = /^[a-z]{2}$/i;
const qobuzLocale = /^[a-z]{2}-[a-z]{2}$/i;

const notALink =
  "This doesn't look like a Spotify, Apple Music, Qobuz or Tidal album or track link.";

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
  if (!id || rest.length > 0 || !spotifyId.test(id)) return incomplete("spotify");
  return parsed({
    service: "spotify",
    kind,
    id,
    ...albumOf(kind, id),
    url: `https://open.spotify.com/${kind}/${id}`,
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
  const sf = segments[0] && storefront.test(segments[0]) ? segments[0].toLowerCase() : undefined;
  const [section, ...tail] = sf ? segments.slice(1) : segments;
  const kind = section?.toLowerCase();
  if (kind !== "album" && kind !== "song") return notAlbumOrTrack("apple-music");
  const id = tail.at(-1);
  if (!id || tail.length > 2 || !digits.test(id)) return incomplete("apple-music");
  const base = `https://music.apple.com${sf ? `/${sf}` : ""}`;
  const where = sf ? { storefront: sf } : {};
  if (kind === "song") {
    return parsed({
      service: "apple-music",
      kind: "track",
      id,
      ...where,
      url: `${base}/song/${id}`,
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
      url: `${base}/album/${id}`,
    });
  }
  if (!digits.test(song)) return incomplete("apple-music");
  return parsed({
    service: "apple-music",
    kind: "track",
    id: song,
    albumId: id,
    ...where,
    url: `${base}/album/${id}?i=${song}`,
  });
}

/**
 * Store links, `(/{locale})?/album/{slug}/{id}`; `open.` and `play.` links, `/(album|track)/{id}`. All open
 * through `open.qobuz.com`, which hands over to the app (FR-06.6). Ids are base 36, so case carries nothing.
 */
function qobuz(host: string, segments: string[]): LinkParse {
  if (host === "open.qobuz.com" || host === "play.qobuz.com") {
    const [section, id, ...rest] = segments;
    const kind = linkKind(section);
    if (!kind) return notAlbumOrTrack("qobuz");
    if (!id || rest.length > 0 || !qobuzId.test(id)) return incomplete("qobuz");
    const key = id.toLowerCase();
    return parsed({
      service: "qobuz",
      kind,
      id: key,
      ...albumOf(kind, key),
      url: `https://open.qobuz.com/${kind}/${key}`,
    });
  }
  const locale =
    segments[0] && qobuzLocale.test(segments[0]) ? segments[0].toLowerCase() : undefined;
  const [section, slug, id, ...rest] = locale ? segments.slice(1) : segments;
  if (section?.toLowerCase() !== "album") return notAlbumOrTrack("qobuz");
  if (!slug || !id || rest.length > 0 || !qobuzId.test(id)) return incomplete("qobuz");
  const key = id.toLowerCase();
  return parsed({
    service: "qobuz",
    kind: "album",
    id: key,
    albumId: key,
    ...(locale ? { locale } : {}),
    slug,
    url: `https://open.qobuz.com/album/${key}`,
  });
}

/** `(/browse)?/(album|track)/{id}`, with a share link's `/u` and `?u` dropped. */
function tidal(segments: string[]): LinkParse {
  const path = segments[0]?.toLowerCase() === "browse" ? segments.slice(1) : segments;
  const [section, id, ...rest] = path.at(-1)?.toLowerCase() === "u" ? path.slice(0, -1) : path;
  const kind = linkKind(section);
  if (!kind) return notAlbumOrTrack("tidal");
  if (!id || rest.length > 0 || !digits.test(id)) return incomplete("tidal");
  return parsed({
    service: "tidal",
    kind,
    id,
    ...albumOf(kind, id),
    url: `https://tidal.com/${kind}/${id}`,
  });
}

/**
 * Parses one pasted link (TS-40). It fetches nothing: a short link comes back as `short`, for
 * `resolveShortLink()`. Input that isn't an album or track link of the four services fails with
 * `unsupported_link` and a reason (FR-02.3).
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
  const host = url.hostname;
  if (shortLinkHosts.has(host)) {
    url.protocol = "https:";
    url.hash = "";
    return { status: "short", url: url.href };
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const service = linkHosts.get(host);
  if (service === "spotify") return spotifyUrl(segments);
  if (service === "apple-music") return appleMusic(segments, url.searchParams);
  if (service === "qobuz") return qobuz(host, segments);
  if (service === "tidal") return tidal(segments);
  return unsupported(notALink);
}

/** The part of `fetch` the resolver uses. Production passes `safeFetch` (TS-103). */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

// Functions rather than constants, so no caller can change another's failure.
const deadEnd = () => unsupported("This Spotify short link doesn't lead to an album or track.");
const unreachable = (): Extract<LinkParse, { status: "failed" }> => ({
  status: "failed",
  failure: failure(
    "provider_unavailable",
    "Couldn't reach Spotify to open this short link. Try again.",
  ),
});

/**
 * Follows a short link the way TS-40 allows: one `GET` per hop with redirects read rather than followed, at most
 * 3 hops, and every `Location` on the allowlist, so no other host is ever requested. The fetcher is required, so
 * no caller can leave out the SSRF guard (TS-103) by omission.
 */
export async function resolveShortLink(
  url: string,
  fetcher: Fetcher,
): Promise<Exclude<LinkParse, { status: "short" }>> {
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
    // Only the status and Location matter.
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
    if (shortLinkHosts.has(next.hostname)) {
      if (next.protocol !== "https:" || next.username || next.password || next.port)
        return deadEnd();
      next.hash = "";
      current = next.href;
      continue;
    }
    if (linkHosts.get(next.hostname) !== "spotify") return deadEnd();
    const target = parseLink(next.href);
    return target.status === "parsed" ? target : deadEnd();
  }
  return deadEnd();
}
