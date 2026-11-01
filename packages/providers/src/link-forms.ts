// The forms MusicBrainz may hold an identifier in (TS-41), measured by the G1 spikes (TON-14, TON-15, TON-100,
// TON-128): step 2 asks for every URL form of an album's link in one request, as editors paste links as they find
// them, and step 3 asks for every barcode form of a UPC or EAN in one search. Each service's URL forms are in the
// services' table (services.ts), beside its canonical URL.

import type { StreamingService } from "@tonaris/domain";

import { services, type LinkHints } from "./services";

/** Every URL form MusicBrainz may hold this album's link in, the canonical one first. */
export function urlForms(
  service: StreamingService,
  albumId: string,
  hints: LinkHints = {},
): string[] {
  return services[service].forms(albumId, hints);
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
