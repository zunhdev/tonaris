// What MusicBrainz's answers share, wherever they are read (TS-41, TS-42, TON-112): the artist credit and its text,
// a date's year, and the search by title and first artist that falls back to the title alone. Fields MusicBrainz
// may leave out or answer as null are `nullish`, so every reader takes what any of its answers carry.

import { z } from "zod";

/** An artist credit: each credited name, the phrase joining it to the next, and the artist it names. */
export const artistCreditSchema = z
  .array(
    z.object({
      name: z.string(),
      joinphrase: z.string().nullish(),
      artist: z.object({ name: z.string(), "sort-name": z.string().nullish() }).nullish(),
    }),
  )
  .nullish();

export type ArtistCredit = z.infer<typeof artistCreditSchema>;

/** A credit as it reads, such as "Simon & Garfunkel": each name with its join phrase. */
export function creditText(credit: ArtistCredit): string {
  return (credit ?? []).map((part) => part.name + (part.joinphrase ?? "")).join("");
}

/** The year of a MusicBrainz date (`YYYY`, `YYYY-MM` or `YYYY-MM-DD`), if it has one. */
export function yearOf(date: string | null | undefined): number | undefined {
  const year = Number(/^(\d{4})/.exec(date ?? "")?.[1]);
  return year >= 1 ? year : undefined;
}

/** A Lucene phrase: only quotes and backslashes need escaping inside one. */
export const phrase = (text: string) =>
  `"${text.replaceAll(/["\\]/g, (character) => `\\${character}`)}"`;

/**
 * What `search` finds for `title` in `field`, by `artist` too, or by the title alone when the artist as a store spells
 * it finds nothing, such as "Mumiy Troll" for Мумий Тролль. Callers pass the title as searched and the first artist.
 */
export async function searchByTitle<T>(
  field: "release" | "releasegroup",
  { title, artist }: { title: string; artist: string },
  search: (query: string) => Promise<T[]>,
): Promise<T[]> {
  const byTitle = `${field}:${phrase(title)}`;
  const found = await search(`${byTitle} AND artist:${phrase(artist)}`);
  return found.length > 0 ? found : search(byTitle);
}
