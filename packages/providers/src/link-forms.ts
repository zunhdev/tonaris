// The forms MusicBrainz may hold an identifier in (TS-41), measured by the G1 spikes (TON-14, TON-15, TON-100):
// step 2 asks for every URL form of an album's link in one request, as editors paste links as they find them, and
// step 3 asks for every barcode form of a UPC or EAN in one search.

import type { StreamingService } from "@tonaris/domain";

/** Storefronts tried besides the link's own: MusicBrainz keeps the storefront its editor pasted. */
const appleStorefronts = ["us", "gb", "de", "fr", "jp", "ca", "au", "nl", "se", "it", "es", "fi"];

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

/** What a link adds to its album's forms: Apple's storefront, and a Qobuz store's locale and slug. */
export type FormHints = { storefront?: string; locale?: string; slug?: string };

const forms: Record<StreamingService, (albumId: string, hints: FormHints) => string[]> = {
  spotify: (albumId) => [`https://open.spotify.com/album/${albumId}`],
  "apple-music": (albumId, { storefront }) =>
    unique([storefront, ...appleStorefronts]).map(
      (code) => `https://music.apple.com/${code}/album/${albumId}`,
    ),
  qobuz: (albumId, { locale, slug }) =>
    unique([
      `https://open.qobuz.com/album/${albumId}`,
      slug && `https://www.qobuz.com/album/${slug}/${albumId}`,
      ...(slug
        ? unique([locale, ...qobuzLocales]).map(
            (code) => `https://www.qobuz.com/${code}/album/${slug}/${albumId}`,
          )
        : []),
      `https://play.qobuz.com/album/${albumId}`,
    ]),
  // MusicBrainz cleans Tidal URLs to the first form; older entries keep the forms they were added in.
  tidal: (albumId) => [
    `https://tidal.com/album/${albumId}`,
    `https://tidal.com/browse/album/${albumId}`,
    `http://www.tidal.com/album/${albumId}`,
    `https://listen.tidal.com/album/${albumId}`,
  ],
};

/** Every URL form MusicBrainz may hold this album's link in, the canonical one first. */
export function urlForms(
  service: StreamingService,
  albumId: string,
  hints: FormHints = {},
): string[] {
  return forms[service](albumId, hints);
}

/**
 * A UPC or EAN as MusicBrainz may store it: 12 digits (UPC-A), 13 (EAN-13) and 14 (GTIN-14), whichever fit. Spotify
 * writes some UPCs as GTIN-14s, and Qobuz's ids match only as UPC-A (TON-14, TON-15).
 */
export function barcodeForms(code: string): string[] {
  if (!/^\d{8,14}$/.test(code)) return [];
  const digits = code.replace(/^0+/, "");
  return [12, 13, 14]
    .filter((length) => digits.length <= length)
    .map((length) => digits.padStart(length, "0"));
}

/** A Qobuz album id of 13 digits is the album's EAN-13 (TS-41 step 3). */
export const qobuzBarcode = (albumId: string) => (/^\d{13}$/.test(albumId) ? albumId : undefined);
