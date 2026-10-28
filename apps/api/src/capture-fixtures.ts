// What capture asks, stubbed for the browser tests and the sync client's tests (TS-121, TON-45): links are parsed for
// real, then answered from the table below instead of MusicBrainz, iTunes Lookup and the store pages, so AC-06 runs
// end to end without the network. The image proxy's artwork comes from a stub host too (TON-48). Not part of the
// deployable service.

import { failure, serviceNames, type AlbumFacts, type AlbumFields } from "@tonaris/domain";
import {
  parseLink,
  ProviderUnavailableError,
  unidentifiedReasons,
  type Identification,
  type ParsedLink,
} from "@tonaris/providers";

import type { ImageFetch } from "./artwork";
import type { CaptureDeps } from "./capture";

const ids = {
  bleach: "f1afec0b-26dd-3db5-9aa1-c91229a74a24",
  nevermind: "1b022e01-4da6-387b-8658-8678046e4cef",
  inUtero: "a0d4e6f0-8a8c-3a4d-8d0e-4c1b6b3c1d27",
  holyDiver: "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
  lastInLine: "8a7c3f4e-1d2b-3c4d-8e5f-6a7b8c9d0e1f",
  masterOfReality: "3c4d5e6f-7081-4a2b-9c3d-e4f5a6b7c8d9",
  undated: "2c3d4e5f-6071-4829-93a4-b5c6d7e8f901",
  flaky: "4d5e6f70-8192-4a3b-8c4d-f5a6b7c8d9e0",
  down: "5e6f7081-92a3-4b4c-9d5e-a6b7c8d9e0f1",
};

/** The links the tests paste, as people would. */
export const fixtureLinks = {
  bleachSpotify: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv",
  bleachOtherSpotify: "https://open.spotify.com/album/0000000000000000000001",
  bleachTrackSpotify: "https://open.spotify.com/track/3oo3sYwFzKqVvnpQyiAkNx",
  nevermindApple: "https://music.apple.com/us/album/nevermind/1440783617",
  inUteroQobuz: "https://open.qobuz.com/album/0060253780880",
  holyDiverTidal: "https://tidal.com/album/77654321",
  tidalTrack: "https://tidal.com/track/12345678",
  idealApple: "https://music.apple.com/us/album/1000000001",
  ambiguousApple: "https://music.apple.com/us/album/1000000002",
  undatedQobuz: "https://open.qobuz.com/album/0000000000013",
  slowSpotify: "https://open.spotify.com/album/0000000000000000000007",
  flakySpotify: "https://open.spotify.com/album/0000000000000000000008",
  downSpotify: "https://open.spotify.com/album/0000000000000000000009",
} as const;

/** A link's identity in the table: its service, kind and id, whatever form it was pasted in. */
const keyOf = (link: ParsedLink) => `${link.service}:${link.kind}:${link.id}`;
const keyOfInput = (input: string) => {
  const parsed = parseLink(input);
  if (parsed.status !== "parsed") throw new Error(`Not a fixture link: ${input}`);
  return keyOf(parsed.link);
};

const identified =
  (releaseGroupId: string) =>
  (link: ParsedLink): Identification => ({
    status: "identified",
    link,
    step: 2,
    releaseGroupId,
  });

const identifications: Record<string, (link: ParsedLink) => Identification> = {
  [keyOfInput(fixtureLinks.bleachSpotify)]: identified(ids.bleach),
  [keyOfInput(fixtureLinks.bleachOtherSpotify)]: identified(ids.bleach),
  [keyOfInput(fixtureLinks.bleachTrackSpotify)]: identified(ids.bleach),
  [keyOfInput(fixtureLinks.nevermindApple)]: identified(ids.nevermind),
  [keyOfInput(fixtureLinks.inUteroQobuz)]: identified(ids.inUtero),
  [keyOfInput(fixtureLinks.holyDiverTidal)]: identified(ids.holyDiver),
  [keyOfInput(fixtureLinks.undatedQobuz)]: identified(ids.undated),
  [keyOfInput(fixtureLinks.slowSpotify)]: identified(ids.masterOfReality),
  [keyOfInput(fixtureLinks.flakySpotify)]: identified(ids.flaky),
  [keyOfInput(fixtureLinks.downSpotify)]: identified(ids.down),
  [keyOfInput(fixtureLinks.tidalTrack)]: (link) => ({
    status: "unidentified",
    link,
    reason: unidentifiedReasons.trackOnly("tidal"),
  }),
  [keyOfInput(fixtureLinks.idealApple)]: (link) => ({
    status: "unidentified",
    link,
    reason: unidentifiedReasons.notFound,
    prefill: {
      source: "itunes-lookup",
      values: { title: "Idéal", artistCredit: "Trust", originalYear: 1983 },
    },
  }),
  [keyOfInput(fixtureLinks.ambiguousApple)]: (link) => ({
    status: "ambiguous",
    link,
    step: 4,
    candidates: [
      { releaseGroupId: ids.lastInLine, title: "The Last in Line" },
      { releaseGroupId: ids.holyDiver, title: "Holy Diver" },
    ],
  }),
};

function found(releaseGroupId: string, values: Partial<AlbumFields>): AlbumFacts {
  return {
    status: "found",
    askedId: releaseGroupId,
    releaseGroupId,
    values: Object.fromEntries(
      Object.entries(values).map(([field, value]) => [
        field,
        { value, source: "musicbrainz", ref: releaseGroupId },
      ]),
    ),
  };
}

const album = (title: string, artistCredit: string, originalYear: number | null) => ({
  title,
  artistCredit,
  releaseType: "album" as const,
  isLive: false,
  ...(originalYear === null ? {} : { originalYear }),
});

const facts: Record<string, AlbumFacts> = {
  [ids.bleach]: found(ids.bleach, album("Bleach", "Nirvana", 1989)),
  [ids.nevermind]: found(ids.nevermind, album("Nevermind", "Nirvana", 1991)),
  [ids.inUtero]: found(ids.inUtero, album("In Utero", "Nirvana", 1993)),
  [ids.holyDiver]: found(ids.holyDiver, album("Holy Diver", "Dio", 1983)),
  [ids.lastInLine]: found(ids.lastInLine, album("The Last in Line", "Dio", 1984)),
  [ids.masterOfReality]: found(
    ids.masterOfReality,
    album("Master of Reality", "Black Sabbath", 1971),
  ),
  [ids.undated]: found(ids.undated, album("Untitled", "Someone", null)),
  [ids.flaky]: found(ids.flaky, album("Paranoid", "Black Sabbath", 1970)),
};

/** How long the slow link's album takes to describe, so a test sees its placeholder. */
export const slowLinkMs = 2_000;

/**
 * The stubbed capture. The flaky link's MusicBrainz is down the first time it is asked, and answers after; the down
 * link's never answers. Any other link is unidentified.
 */
export function fixtureCapture(): CaptureDeps {
  let flakyAsked = 0;
  return {
    identify: async (input, context) => {
      const parsed = parseLink(input);
      if (parsed.status === "failed") return { status: "failed", failure: parsed.failure };
      if (parsed.status === "short") {
        return {
          status: "failed",
          failure: failure(
            "provider_unavailable",
            `Couldn't reach ${serviceNames.spotify} to open this short link. Try again.`,
          ),
        };
      }
      const { link } = parsed;
      const linked = await context.linked(link.service, link.albumId ?? link.id);
      if (linked) return { status: "linked", link, albumId: linked };
      const answer = identifications[keyOf(link)];
      return answer
        ? answer(link)
        : { status: "unidentified", link, reason: unidentifiedReasons.notFound };
    },
    describe: async (releaseGroupId) => {
      if (releaseGroupId === ids.masterOfReality) await Bun.sleep(slowLinkMs);
      if (releaseGroupId === ids.down) {
        throw new ProviderUnavailableError("musicbrainz", "MusicBrainz is down in this fixture");
      }
      if (releaseGroupId === ids.flaky && (flakyAsked += 1) === 1) {
        throw new ProviderUnavailableError("musicbrainz", "MusicBrainz was busy the first time");
      }
      return facts[releaseGroupId] ?? { status: "deleted", askedId: releaseGroupId };
    },
  };
}

/** A 1×1 PNG: what the fixture image host answers. */
const pixel = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (char) => char.codePointAt(0) ?? 0,
);

/** Artwork the browser tests show: under `https://images.example/`, a PNG, except names starting "missing". */
export const fixtureImageFetch: ImageFetch = (url) => {
  const { host, pathname } = new URL(url);
  if (host !== "images.example" || pathname.startsWith("/missing")) {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
  return Promise.resolve(new Response(pixel, { headers: { "content-type": "image/png" } }));
};
