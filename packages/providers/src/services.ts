// What each streaming service's links look like, in one table (TS-40, TS-41): the hosts its links and short links
// are on, what its ids look like, its canonical URL, and every form MusicBrainz may hold an album's link in, as the
// G1 spikes measured them (TON-14, TON-15, TON-100, TON-128). Editors paste links as they find them, so step 2 asks
// for every form in one request. It imports only the domain, as links.ts does, so browsers can use it too.

import type { LinkKind, StreamingService } from "@tonaris/domain";

/** What a link adds to its URLs: the album a track names, Apple's storefront, and a Qobuz store's locale and slug. */
export type LinkHints = { albumId?: string; storefront?: string; locale?: string; slug?: string };

export type ServiceLinks = {
  /** The hosts its links are on. */
  hosts: readonly string[];
  /** The hosts of its short links, which only the server follows (TS-40). */
  shortLinkHosts: readonly string[];
  /** What an album's id and a track's id look like. */
  ids: Readonly<Record<LinkKind, RegExp>>;
  /** The canonical URL of a link to `id` (TS-40). */
  canonical: (kind: LinkKind, id: string, hints?: LinkHints) => string;
  /** Every URL form MusicBrainz may hold an album's link in, the canonical one first (TS-41 step 2). */
  forms: (albumId: string, hints: LinkHints) => string[];
};

const spotifyId = /^[0-9A-Za-z]{22}$/;
const digits = /^\d+$/;
/** Qobuz ids are base 36. */
const qobuzId = /^[0-9a-z]+$/i;
/** An album's auto-generated playlist; every one the spike sampled had 33 characters after the prefix. */
const youtubeAlbum = /^OLAK5uy_[\w-]{33}$/;
const youtubeVideo = /^[\w-]{11}$/;

/** An Apple Music storefront, such as `fi`. */
export const appleStorefront = /^[a-z]{2}$/i;
/** A Qobuz store's locale, such as `gb-en`. */
export const qobuzLocale = /^[a-z]{2}-[a-z]{2}$/i;

/** The storefronts iTunes Lookup tries after an Apple link's own, which a link without one leaves to these (TS-41). */
export const appleLookupStorefronts = ["us", "gb"];
/** Storefronts MusicBrainz may hold an Apple link under besides the link's own: it keeps the one its editor pasted. */
const appleFormStorefronts = [
  ...appleLookupStorefronts,
  "de",
  "fr",
  "jp",
  "ca",
  "au",
  "nl",
  "se",
  "it",
  "es",
  "fi",
];

/**
 * Qobuz's home store, which request A asks for open. and play. links, as they carry no store (decided 21 October
 * 2026): `us-en` missed albums European stores sell (TS-41).
 */
export const qobuzHomeLocale = "fr-fr";
/** Qobuz store locales, which MusicBrainz also keeps as pasted. */
const qobuzLocales = [
  "us-en",
  "gb-en",
  "fr-fr",
  "de-de",
  "it-it",
  "es-es",
  "nl-nl",
  "be-fr",
  "be-nl",
  "ch-de",
  "ch-fr",
  "at-de",
  "lu-fr",
  "ie-en",
  "fi-en",
  "se-en",
  "dk-en",
  "no-en",
  "au-en",
  "nz-en",
  "ca-en",
  "ca-fr",
  "jp-ja",
  "br-pt",
  "mx-es",
  "ar-es",
  "cl-es",
  "co-es",
];

const unique = (items: readonly (string | undefined)[]) => [
  ...new Set(items.filter((item): item is string => item !== undefined)),
];

const spotifyUrl = (kind: LinkKind, id: string) => `https://open.spotify.com/${kind}/${id}`;

/** The storefront stays as pasted, and a link without one stays without, so Apple picks the store. */
function appleUrl(kind: LinkKind, id: string, { albumId, storefront }: LinkHints = {}): string {
  const base = `https://music.apple.com${storefront ? `/${storefront}` : ""}`;
  if (kind === "album") return `${base}/album/${id}`;
  return albumId === undefined ? `${base}/song/${id}` : `${base}/album/${albumId}?i=${id}`;
}

/** Every Qobuz link opens through `open.qobuz.com`, which hands over to the app (FR-06.6). */
const qobuzUrl = (kind: LinkKind, id: string) => `https://open.qobuz.com/${kind}/${id}`;

const tidalUrl = (kind: LinkKind, id: string) => `https://tidal.com/${kind}/${id}`;

/** A track stands for its album, so both keep the album's playlist as the link (TON-131). */
const youtubeUrl = (kind: LinkKind, id: string, { albumId }: LinkHints = {}) =>
  `https://music.youtube.com/playlist?list=${kind === "album" ? id : (albumId ?? id)}`;

export const services: Readonly<Record<StreamingService, ServiceLinks>> = {
  spotify: {
    hosts: ["open.spotify.com"],
    shortLinkHosts: ["spotify.link", "spotify.app.link"],
    ids: { album: spotifyId, track: spotifyId },
    canonical: spotifyUrl,
    forms: (albumId) => [spotifyUrl("album", albumId)],
  },
  "apple-music": {
    hosts: ["music.apple.com", "geo.music.apple.com"],
    shortLinkHosts: [],
    ids: { album: digits, track: digits },
    canonical: appleUrl,
    // The canonical URL under the link's storefront first, then under the common ones.
    forms: (albumId, { storefront }) =>
      unique([storefront, ...appleFormStorefronts]).map((code) =>
        appleUrl("album", albumId, { storefront: code }),
      ),
  },
  qobuz: {
    hosts: ["www.qobuz.com", "qobuz.com", "open.qobuz.com", "play.qobuz.com"],
    shortLinkHosts: [],
    ids: { album: qobuzId, track: qobuzId },
    canonical: qobuzUrl,
    forms: (albumId, { locale, slug }) =>
      unique([
        qobuzUrl("album", albumId),
        slug && `https://www.qobuz.com/album/${slug}/${albumId}`,
        ...(slug
          ? unique([locale, ...qobuzLocales]).map(
              (code) => `https://www.qobuz.com/${code}/album/${slug}/${albumId}`,
            )
          : []),
        `https://play.qobuz.com/album/${albumId}`,
      ]),
  },
  tidal: {
    hosts: ["tidal.com", "www.tidal.com", "listen.tidal.com"],
    shortLinkHosts: [],
    ids: { album: digits, track: digits },
    canonical: tidalUrl,
    // MusicBrainz cleans Tidal URLs to the first form; older entries keep the forms they were added in.
    forms: (albumId) => [
      tidalUrl("album", albumId),
      `https://tidal.com/browse/album/${albumId}`,
      `http://www.tidal.com/album/${albumId}`,
      `https://listen.tidal.com/album/${albumId}`,
    ],
  },
  "youtube-music": {
    hosts: ["music.youtube.com", "www.youtube.com", "youtube.com", "m.youtube.com"],
    shortLinkHosts: [],
    ids: { album: youtubeAlbum, track: youtubeVideo },
    canonical: youtubeUrl,
    // MusicBrainz mostly stores www.youtube.com's form, sometimes music.youtube.com's.
    forms: (albumId) => [
      youtubeUrl("album", albumId),
      `https://www.youtube.com/playlist?list=${albumId}`,
      `https://youtube.com/playlist?list=${albumId}`,
    ],
  },
};
