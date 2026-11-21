// The capture the Help pictures' API uses (TON-308, TON-309): the browser tests' fixtures, plus one Spotify link that
// fits two invented albums called Harbour Songs, one of them already in Robin's demo collection, so the picture of
// "Which album is this?" shows only invented albums. Not part of the deployable service.

import type { AlbumFacts } from "@tonaris/domain";
import { parseLink } from "@tonaris/providers";

import type { CaptureDeps } from "./capture";
import { fixtureCapture } from "./capture-fixtures";

/** The link the pictures paste to be asked which album it is. */
export const ambiguousDemoLink = "https://open.spotify.com/album/6pIctur3sHarb0urS0ngs1";
const ambiguousId = "6pIctur3sHarb0urS0ngs1";
/** The other Harbour Songs, by another artist, that isn't in the collection. */
const otherHarbourSongs = "5b0d1a2e-7c3f-4e8a-9b6d-2f1e3c4a5b6c";

const found = (
  releaseGroupId: string,
  title: string,
  artistCredit: string,
  originalYear: number,
): AlbumFacts => ({
  status: "found",
  askedId: releaseGroupId,
  releaseGroupId,
  values: Object.fromEntries(
    Object.entries({ title, artistCredit, originalYear, releaseType: "album", isLive: false }).map(
      ([field, value]) => [field, { value, source: "musicbrainz", ref: releaseGroupId }],
    ),
  ),
});

/** The fixtures' capture, with the demo's ambiguous link; `harbourSongs` is the saved album's release group. */
export function picturesCapture(harbourSongs: string): CaptureDeps {
  const fixtures = fixtureCapture();
  return {
    ...fixtures,
    identify: async (input, context) => {
      const parsed = parseLink(input);
      if (parsed.status === "parsed" && parsed.link.id === ambiguousId) {
        return {
          status: "ambiguous",
          link: parsed.link,
          step: 4,
          candidates: [
            { releaseGroupId: harbourSongs, title: "Harbour Songs" },
            { releaseGroupId: otherHarbourSongs, title: "Harbour Songs" },
          ],
        };
      }
      return fixtures.identify(input, context);
    },
    describe: async (releaseGroupId) => {
      if (releaseGroupId === harbourSongs) {
        return found(harbourSongs, "Harbour Songs", "Iona MacLeod", 2003);
      }
      if (releaseGroupId === otherHarbourSongs) {
        return found(otherHarbourSongs, "Harbour Songs", "Calum Rae", 1997);
      }
      return fixtures.describe(releaseGroupId);
    },
  };
}
