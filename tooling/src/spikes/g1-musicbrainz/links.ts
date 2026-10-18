// Step 0 of the TS-41 chain for the G1 spike: local, allowlisted parsing of pasted links (TS-40).
// Spike code: the production parser is TON-39 (M3-01), which can take what this spike learns about real links.

export type Service = "spotify" | "apple-music" | "qobuz";

/** The part of `fetch` the spike uses, so tests can stand in for the network. */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type ParsedLink = {
  service: Service;
  kind: "album" | "track";
  /** The service's id for `kind`. For an Apple track link it is the album's, with the song in `trackId`. */
  id: string;
  /** The parent album's id, when the link names it: album links, and Apple track links. */
  albumId?: string;
  trackId?: string;
  /** Apple storefront, such as `us`. */
  storefront?: string;
  /** Qobuz locale and slug, from `www.qobuz.com/{locale}/album/{slug}/{id}`. */
  locale?: string;
  slug?: string;
  canonical: string;
};

export type ParseResult =
  | { ok: true; link: ParsedLink }
  | { ok: false; reason: string; shortLink?: string };

const spotifyId = /^[0-9A-Za-z]{22}$/;

function spotify(kind: string, id: string): ParseResult {
  if ((kind !== "album" && kind !== "track") || !spotifyId.test(id)) {
    return { ok: false, reason: `Spotify ${kind} links aren't supported` };
  }
  return {
    ok: true,
    link: {
      service: "spotify",
      kind,
      id,
      ...(kind === "album" && { albumId: id }),
      canonical: `https://open.spotify.com/${kind}/${id}`,
    },
  };
}

/** Parses one pasted link. Short links come back unparsed with `shortLink` set, for the caller to resolve. */
export function parseLink(input: string): ParseResult {
  const text = input.trim();
  const uri = /^spotify:(album|track):([0-9A-Za-z]+)$/.exec(text);
  if (uri?.[1] && uri[2]) return spotify(uri[1], uri[2]);

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: "not a link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, reason: "not a web link" };
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "spotify.link" || host === "spotify.app.link") {
    return { ok: false, reason: "short link", shortLink: url.href };
  }
  if (host === "open.spotify.com") {
    const [first, ...rest] = parts;
    const [kind, id] = first?.startsWith("intl-") ? rest : [first, rest[0]];
    return kind && id ? spotify(kind, id) : { ok: false, reason: "unrecognized Spotify link" };
  }

  if (host === "music.apple.com" || host === "geo.music.apple.com") {
    // /{sf}/album/{slug}/{id}, /{sf}/album/{id} or /album/{id}; ?i= names a song on that album.
    const hasStorefront = parts[0] !== "album";
    const storefront = hasStorefront ? parts[0]?.toLowerCase() : undefined;
    const rest = hasStorefront ? parts.slice(1) : parts;
    if (rest[0] !== "album") {
      return { ok: false, reason: `Apple Music ${rest[0] ?? "root"} links aren't supported` };
    }
    const id = rest.at(-1);
    if (!id || !/^\d+$/.test(id)) return { ok: false, reason: "no Apple Music album id" };
    const trackId = url.searchParams.get("i") ?? undefined;
    const sf = storefront ?? "us";
    return {
      ok: true,
      link: {
        service: "apple-music",
        kind: trackId ? "track" : "album",
        id,
        albumId: id,
        ...(trackId && { trackId }),
        storefront: sf,
        canonical: `https://music.apple.com/${sf}/album/${id}${trackId ? `?i=${trackId}` : ""}`,
      },
    };
  }

  if (host === "www.qobuz.com" || host === "qobuz.com") {
    // /{locale}/album/{slug}/{id}, and the locale-less /album/{slug}/{id} MusicBrainz stores.
    const albumAt = parts.indexOf("album");
    const locale = albumAt === 1 ? parts[0] : undefined;
    const [slug, id] = albumAt >= 0 ? parts.slice(albumAt + 1) : [];
    if (!slug || !id) return { ok: false, reason: "unrecognized Qobuz link" };
    return {
      ok: true,
      link: {
        service: "qobuz",
        kind: "album",
        id,
        albumId: id,
        ...(locale && { locale }),
        slug,
        canonical: `https://open.qobuz.com/album/${id}`,
      },
    };
  }
  if (host === "open.qobuz.com" || host === "play.qobuz.com") {
    const [kind, id] = parts;
    if ((kind !== "album" && kind !== "track") || !id) {
      return { ok: false, reason: `Qobuz ${kind ?? "root"} links aren't supported` };
    }
    if (host === "play.qobuz.com" && kind === "track") {
      return { ok: false, reason: "play.qobuz.com track links aren't in TS-40" };
    }
    return {
      ok: true,
      link: {
        service: "qobuz",
        kind,
        id,
        ...(kind === "album" && { albumId: id }),
        canonical: `https://open.qobuz.com/${kind}/${id}`,
      },
    };
  }

  return { ok: false, reason: `${host} isn't a supported service` };
}

const shortLinkHosts = new Set(["spotify.link", "spotify.app.link"]);
const allowedTargets = new Set(["open.spotify.com", "spotify.link", "spotify.app.link"]);

/**
 * Follows a short link the way TS-40 allows: GET with manual redirects, at most 3 hops, every `Location` on the
 * allowlist. The production version goes through the SSRF guard (TS-103).
 */
export async function resolveShortLink(href: string, fetcher: Fetcher = fetch): Promise<string> {
  let current = href;
  for (let hop = 0; hop < 3; hop++) {
    // Each hop depends on the previous one's Location.
    // oxlint-disable-next-line no-await-in-loop
    const response = await fetcher(current, { redirect: "manual" });
    const location = response.headers.get("location");
    if (!location) throw new Error(`${current} answered ${response.status} without a redirect`);
    const next = new URL(location, current);
    if (!allowedTargets.has(next.hostname))
      throw new Error(`${next.hostname} isn't on the allowlist`);
    if (!shortLinkHosts.has(next.hostname)) return next.href;
    current = next.href;
  }
  throw new Error("more than 3 redirects");
}
