// Find artwork (TON-112, FR-03.4): covers on the Cover Art Archive for a title and an artist, for a signed-in owner to
// choose from. Each comes signed, so the app shows it through the image proxy (TS-103). Choosing one is an ordinary
// artwork edit; this route saves nothing.

import { Elysia } from "elysia";
import { z } from "zod";

import { coversSchema, maxAlbumTextLength, problemSchema } from "@tonaris/domain";
import { providerNames, ProviderUnavailableError, type Cover } from "@tonaris/providers";

import type { SessionGuard } from "../../auth/plugin";
import type { ArtworkSigner } from "../../img/artwork";
import { ProblemError } from "../../problem";

/** What the route asks: `findCovers` with the API's MusicBrainz, or a stand-in in tests. */
export type CoverFinder = (query: { title: string; artist: string }) => Promise<Cover[]>;

const coversQuery = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(maxAlbumTextLength)
    .meta({ description: "The album's title." }),
  artist: z
    .string()
    .trim()
    .min(1)
    .max(maxAlbumTextLength)
    .meta({ description: "The album's artist credit." }),
});

/** What a search that couldn't ask says: the archive it couldn't reach, the only two `findCovers` asks. */
function unavailable(provider: ProviderUnavailableError["provider"]): string {
  return provider === "musicbrainz" || provider === "coverartarchive"
    ? `Couldn't reach ${providerNames[provider]}. Try again.`
    : "Couldn't find artwork right now. Try again.";
}

export function coverRoutes(
  session: SessionGuard,
  { covers, artwork }: { covers?: CoverFinder | undefined; artwork: ArtworkSigner },
) {
  return new Elysia().use(session).get(
    "/artwork/covers",
    {
      signedIn: true,
      query: coversQuery,
      response: { 200: coversSchema, 401: problemSchema, 422: problemSchema, 503: problemSchema },
      detail: {
        summary: "Find covers for an album",
        description:
          "Albums MusicBrainz has for the title and artist, by the first artist and then by the title alone, each with its Cover Art Archive front, for the owner to choose from (FR-03.4). Albums without a front are left out. Choosing one is an ordinary artwork edit with its `artworkUrl`. 503 when MusicBrainz, or the archive for every album found, can't be asked.",
        tags: ["artwork"],
        operationId: "findCovers",
      },
    },
    async ({ query }) => {
      if (!covers) throw new ProblemError(503, "provider_unavailable", unavailable("musicbrainz"));
      try {
        const found = await covers(query);
        // Each is signed, as album records are, so the app can show it (TS-103).
        return {
          covers: found.map((cover) =>
            Object.assign(cover, { artworkSignature: artwork.sign(cover.artworkUrl) }),
          ),
        };
      } catch (error) {
        if (error instanceof ProviderUnavailableError) {
          throw new ProblemError(503, "provider_unavailable", unavailable(error.provider));
        }
        throw error;
      }
    },
  );
}
