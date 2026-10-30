// The identification cases (TON-42): real links from the G1 spikes and the creator's sample, run through the chain
// against recorded MusicBrainz and iTunes Lookup answers (`bun packages/providers/fixtures/identify/record.ts`).
// Spotify's answers and the store pages are stubs. Their values are MusicBrainz's (CC0) for the same album, or
// made up (ids of zeros and ones): no Spotify value or store page content is committed (TS-41).

import { barcodeForms, urlForms } from "../../src/link-forms";
import type { DetailsCase, IdentifyCase, Stub } from "./harness";

/** A Qobuz album page, as minimal as extraction needs, with the album's facts from MusicBrainz. */
function qobuzPage(title: string, artist: string, date: string): Stub {
  const blocks = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: title,
      brand: { name: artist },
      releaseDate: date,
    },
    { "@context": "https://schema.org", "@type": "MusicAlbum", name: title, datePublished: date },
  ];
  return {
    status: 200,
    body: `<html><script type="application/ld+json">${JSON.stringify(blocks)}</script></html>`,
  };
}

/** A Tidal album page, as minimal as extraction needs, with the album's facts from MusicBrainz. */
function tidalPage(title: string, artists: string[], date: string): Stub {
  const album = {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: title,
    byArtist: artists.map((name) => ({ "@type": "MusicGroup", name })),
    datePublished: date,
  };
  return {
    status: 200,
    body: `<html><script type="application/ld+json">${JSON.stringify(album)}</script></html>`,
  };
}

const spotifyAlbum = (id: string, upc: string): Record<string, Stub> => ({
  [`https://api.spotify.com/v1/albums/${id}`]: { status: 200, body: { id, external_ids: { upc } } },
});
const spotifyTrack = (id: string, albumId: string): Record<string, Stub> => ({
  [`https://api.spotify.com/v1/tracks/${id}`]: {
    status: 200,
    body: { id, album: { id: albumId } },
  },
});
const redirect = (location: string, status = 301): Stub => ({ status, headers: { location } });

/** The URL lookup MusicBrainz's client sends for these forms, for stand-in answers. */
export function urlLookup(forms: readonly string[]): string {
  const url = new URL("https://musicbrainz.org/ws/2/url");
  for (const form of forms) url.searchParams.append("resource", form);
  url.searchParams.append("inc", "release-rels release-group-rels");
  url.searchParams.set("fmt", "json");
  return url.href;
}

/** The barcode search MusicBrainz's client sends for these forms, for stand-in answers. */
export function barcodeSearch(forms: readonly string[]): string {
  const url = new URL("https://musicbrainz.org/ws/2/release");
  url.searchParams.append("query", forms.map((form) => `barcode:${form}`).join(" OR "));
  url.searchParams.append("limit", "100");
  url.searchParams.set("fmt", "json");
  return url.href;
}

// Made-up Spotify ids: MusicBrainz knows none of them.
const unknownAlbum = "0000000000000000000000";
const unknownTrack = "1111111111111111111111";
const missingTrack = "2222222222222222222222";
const missingAlbum = "3333333333333333333333";
/** *Random Access Memories*'s barcode, as MusicBrainz holds it. */
const knownBarcode = "886443927087";
const missingBarcode = "000000000017";

export const cases = {
  saved: {
    name: "a link already saved",
    input: "https://open.spotify.com/album/32NZSslCL03dkXyILrrbGe?si=LnOyGBweR4agFG4VItiz7A",
    spotify: true,
    linked: { "spotify:32NZSslCL03dkXyILrrbGe": "0199e0a1-0000-7000-8000-000000000001" },
  },
  spotifyUrl: {
    name: "a Spotify album MusicBrainz knows by URL",
    input: "https://open.spotify.com/album/32NZSslCL03dkXyILrrbGe",
    spotify: true,
  },
  spotifyShortLink: {
    name: "a Spotify short link to that album",
    input: "https://spotify.link/abc123XYZ",
    spotify: true,
    stubs: {
      "https://spotify.link/abc123XYZ": redirect(
        "https://open.spotify.com/album/32NZSslCL03dkXyILrrbGe?si=x",
        307,
      ),
    },
  },
  spotifyBarcode: {
    name: "a Spotify album MusicBrainz knows by barcode",
    input: `https://open.spotify.com/album/${unknownAlbum}`,
    spotify: true,
    stubs: spotifyAlbum(unknownAlbum, knownBarcode),
  },
  spotifyTrack: {
    name: "a Spotify track whose album MusicBrainz knows by barcode",
    input: `https://open.spotify.com/track/${unknownTrack}`,
    spotify: true,
    stubs: {
      ...spotifyTrack(unknownTrack, unknownAlbum),
      ...spotifyAlbum(unknownAlbum, knownBarcode),
    },
  },
  spotifyMissing: {
    name: "a Spotify track MusicBrainz lacks",
    input: `https://open.spotify.com/track/${missingTrack}`,
    spotify: true,
    stubs: {
      ...spotifyTrack(missingTrack, missingAlbum),
      ...spotifyAlbum(missingAlbum, missingBarcode),
      // Made-up barcodes can be real ones, so MusicBrainz's answer is a stand-in: no release.
      [barcodeSearch(barcodeForms(missingBarcode))]: {
        status: 200,
        body: { count: 0, releases: [] },
      },
    },
  },
  spotifyOff: {
    name: "a Spotify album with the bridge off",
    input: `https://open.spotify.com/album/${unknownAlbum}`,
    spotify: false,
  },
  appleHints: {
    name: "Apple's hints for Икра (Deluxe)",
    input: "https://music.apple.com/fi/album/%D0%B8%D0%BA%D1%80%D0%B0-deluxe/869027888",
    spotify: true,
  },
  appleSingle: {
    name: "Apple's hints for Trust's Idéal, an album and a single of that name",
    input: "https://music.apple.com/us/album/254249657",
    spotify: true,
  },
  appleYear: {
    name: "Apple's hints for The Nutcracker (Remastered 2026)",
    input: "https://music.apple.com/fi/album/tchaikovsky-the-nutcracker-remastered-2026/6809480000",
    spotify: true,
  },
  appleSong: {
    name: "an Apple Music /song/ link",
    input: "https://music.apple.com/fi/song/so-what/268443097",
    spotify: true,
  },
  qobuzReRecording: {
    name: "an open.qobuz.com link to Red (Taylor's Version), through requests A and B",
    // A made-up id MusicBrainz doesn't link, so the page's hints decide.
    input: "https://open.qobuz.com/album/zzzzzzzzzzzzz",
    spotify: true,
    stubs: {
      "https://www.qobuz.com/fr-fr/album/-/zzzzzzzzzzzzz": redirect(
        "/fr-fr/album/red-taylors-version-taylor-swift/zzzzzzzzzzzzz",
      ),
      "https://www.qobuz.com/fr-fr/album/red-taylors-version-taylor-swift/zzzzzzzzzzzzz": qobuzPage(
        "Red (Taylor's Version)",
        "Taylor Swift",
        "2021-11-12",
      ),
    },
  },
  qobuzAgentSlug: {
    name: "an agent's open.qobuz.com link, identified by request A's slug",
    input: "https://open.qobuz.com/album/tietg8e0jjdh8",
    agent: true,
    spotify: true,
    stubs: {
      "https://www.qobuz.com/fr-fr/album/-/tietg8e0jjdh8": redirect(
        "/fr-fr/album/bleach-nirvana/tietg8e0jjdh8",
      ),
    },
  },
  qobuzAgentUnknown: {
    name: "an agent's Qobuz link MusicBrainz lacks",
    input: "https://open.qobuz.com/album/0884977423006",
    agent: true,
    spotify: true,
    stubs: {
      "https://www.qobuz.com/fr-fr/album/-/0884977423006": redirect(
        "/fr-fr/album/an-album-musicbrainz-lacks/0884977423006",
      ),
    },
  },
  qobuzTrack: {
    name: "a Qobuz track link",
    input: "https://open.qobuz.com/track/59954874",
    spotify: true,
  },
  tidalHints: {
    name: "a Tidal page's hints for Bright Future",
    input: "https://tidal.com/browse/album/348182611/u",
    spotify: true,
    stubs: {
      "https://tidal.com/album/348182611": tidalPage(
        "Bright Future",
        ["Adrianne Lenker"],
        "2024-03-22",
      ),
    },
  },
  tidalTwoAlbums: {
    name: "a Tidal page's hints for Dio's The Last in Line",
    input: "https://tidal.com/browse/album/34453659",
    spotify: true,
    stubs: {
      "https://tidal.com/album/34453659": tidalPage("The Last in Line", ["Dio"], "1984-07-02"),
    },
  },
  tidalAgent: {
    name: "an agent's Tidal link",
    input: "https://tidal.com/browse/album/348182611",
    agent: true,
    spotify: true,
  },
  tidalUnmatched: {
    name: "a Tidal page whose hints fit no album",
    input: "https://tidal.com/album/348182612",
    spotify: true,
    stubs: {
      [urlLookup(urlForms("tidal", "348182612"))]: {
        status: 200,
        body: { "url-count": 0, urls: [] },
      },
      "https://tidal.com/album/348182612": tidalPage(
        "Nothing Like It",
        ["Nobody Known"],
        "2031-01-01",
      ),
    },
  },
  tidalTrack: {
    name: "a Tidal track link",
    input: "https://tidal.com/browse/track/279764934?u",
    spotify: true,
  },
  twoAlbums: {
    name: "a URL MusicBrainz links to two albums",
    input: "https://tidal.com/album/999999999",
    spotify: true,
    stubs: {
      [urlLookup(urlForms("tidal", "999999999"))]: {
        status: 200,
        body: {
          "url-count": 1,
          urls: [
            {
              resource: "https://tidal.com/album/999999999",
              relations: [
                {
                  "target-type": "release_group",
                  release_group: {
                    id: "aa997ea0-2936-40bd-884d-3af8a0e064dc",
                    title: "Random Access Memories",
                  },
                },
                {
                  "target-type": "release_group",
                  release_group: {
                    id: "d34c6b11-6b3b-41ea-9fc6-44db1cc6577a",
                    title: "Random Access Memories (drumless edition)",
                  },
                },
              ],
            },
          ],
        },
      },
    },
  },
  busy: {
    name: "MusicBrainz busy through every retry",
    input: "https://tidal.com/album/888888888",
    spotify: true,
    stubs: { [urlLookup(urlForms("tidal", "888888888"))]: { status: 503 } },
  },
} satisfies Record<string, IdentifyCase>;

/** An agent's details after its link went unidentified (TON-111), as Claude typed them for the creator's albums. */
export const detailsCases = {
  killEmAll: {
    name: "Kill 'Em All, typed with a straight apostrophe",
    details: { title: "Kill 'Em All", artistCredit: "Metallica", originalYear: 1983 },
  },
  andJustice: {
    name: "...And Justice for All, typed with three dots",
    details: { title: "...And Justice for All", artistCredit: "Metallica", originalYear: 1988 },
  },
  killEmAllWrongYear: {
    name: "Kill 'Em All with a year no release has",
    details: { title: "Kill 'Em All", artistCredit: "Metallica", originalYear: 1999 },
  },
  lastInLine: {
    name: "Dio's The Last in Line, which two albums fit",
    details: { title: "The Last in Line", artistCredit: "Dio", originalYear: 1984 },
  },
} satisfies Record<string, DetailsCase>;
