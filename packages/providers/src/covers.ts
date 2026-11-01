// Find artwork (TON-112, FR-03.4): MusicBrainz's albums for a title and an artist, each with the Cover Art Archive's
// front, for the owner to choose from. The search is loose on purpose: the owner sees every cover and picks one, so
// nothing is chosen for them. Other services' covers are ruled out by their terms (TON-17).

import { z } from "zod";

import { ProviderUnavailableError } from "./errors";
import { firstArtist, searchTitle } from "./hints";
import type { MusicBrainz } from "./musicbrainz";
import { artistCreditSchema, creditText, searchByTitle, yearOf } from "./musicbrainz-answers";

/** A cover to choose: its album on MusicBrainz, and the archive's stable `front-500` address. */
export type Cover = {
  releaseGroupId: string;
  title: string;
  artistCredit: string;
  year: number | null;
  /** MusicBrainz's primary type, such as "Album" or "EP", or null when it has none. */
  type: string | null;
  artworkUrl: string;
};

/** The albums asked about at most, and so the covers offered. */
export const maxCovers = 8;

const groupSearchSchema = z.object({
  "release-groups": z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        "primary-type": z.string().nullish(),
        "first-release-date": z.string().nullish(),
        "artist-credit": artistCreditSchema,
      }),
    )
    .default([]),
});

/**
 * The covers for albums named `title` by `artist`, in MusicBrainz's order: by title and first artist, or by title
 * alone when the artist as spelled finds nothing. Albums without a front are left out. Throws
 * `ProviderUnavailableError` when MusicBrainz can't be asked, or the archive can't be for any album found.
 */
export async function findCovers(
  musicBrainz: MusicBrainz,
  { title, artist }: { title: string; artist: string },
): Promise<Cover[]> {
  const groups = await searchByTitle(
    "releasegroup",
    { title: searchTitle(title), artist: firstArtist(artist) },
    async (query) =>
      groupSearchSchema.parse(await musicBrainz.search("release-group", query, maxCovers))[
        "release-groups"
      ],
  );
  // The archive isn't under MusicBrainz's limit, and each answer is kept 7 days.
  const fronts = await Promise.allSettled(
    groups.map((group) => musicBrainz.releaseGroupFront(group.id)),
  );
  const failures = fronts.flatMap((front) => (front.status === "rejected" ? [front.reason] : []));
  const unexpected = failures.find((reason) => !(reason instanceof ProviderUnavailableError));
  if (unexpected !== undefined) throw unexpected;
  if (failures.length > 0 && failures.length === groups.length) throw failures[0];
  return groups.flatMap((group, index): Cover[] => {
    const front = fronts[index];
    if (front?.status !== "fulfilled" || !front.value) return [];
    return [
      {
        releaseGroupId: group.id,
        title: group.title,
        artistCredit: creditText(group["artist-credit"]),
        year: yearOf(group["first-release-date"]) ?? null,
        type: group["primary-type"] ?? null,
        artworkUrl: front.value,
      },
    ];
  });
}
