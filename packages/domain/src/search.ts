// Search results as the app and the server order them (FR-12.4, FR-12.5, X-02; TS-50), and the API's answer. One
// ranking for both, so the same query lists the same things in the same order wherever it runs: names that start
// with the query, then those with a word that does, then any other match, each tier by search key, then ID (decided
// with the creator, 28 October 2026). An album ranks by the better of its title and its artist, ties going by
// title, then artist.

import { albumFieldsSchema } from "./albums";
import { containerKinds } from "./containers";
import { searchTier, type SearchTier } from "./normalize";
import { z } from "./zod";

/** Bytewise, as search keys are compared everywhere (TS-12). */
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The entries whose key matches `queryKey`, a search key, best first. */
export function rankNames<T>(
  entries: Iterable<T>,
  queryKey: string,
  keyOf: (entry: T) => string,
  idOf: (entry: T) => string,
): T[] {
  const matched: { entry: T; key: string; id: string; tier: SearchTier }[] = [];
  for (const entry of entries) {
    const key = keyOf(entry);
    const tier = searchTier(queryKey, key);
    if (tier !== undefined) matched.push({ entry, key, id: idOf(entry), tier });
  }
  return matched
    .toSorted((a, b) => a.tier - b.tier || byKey(a.key, b.key) || byKey(a.id, b.id))
    .map(({ entry }) => entry);
}

/** The albums whose title or artist key matches `queryKey`, best first. */
export function rankAlbums<T>(
  entries: Iterable<T>,
  queryKey: string,
  keysOf: (entry: T) => { title: string; artist: string },
  idOf: (entry: T) => string,
): T[] {
  const matched: { entry: T; title: string; artist: string; id: string; tier: SearchTier }[] = [];
  for (const entry of entries) {
    const { title, artist } = keysOf(entry);
    const byTitle = searchTier(queryKey, title);
    const byArtist = searchTier(queryKey, artist);
    const tier =
      byTitle === undefined || (byArtist !== undefined && byArtist < byTitle) ? byArtist : byTitle;
    if (tier !== undefined) matched.push({ entry, title, artist, id: idOf(entry), tier });
  }
  return matched
    .toSorted(
      (a, b) =>
        a.tier - b.tier ||
        byKey(a.title, b.title) ||
        byKey(a.artist, b.artist) ||
        byKey(a.id, b.id),
    )
    .map(({ entry }) => entry);
}

/** How many results a group gives unless asked for more (DS-75). */
export const defaultSearchLimit = 8;
export const maxSearchLimit = 100;

const locationSchema = z.array(z.string()).meta({
  description:
    "Where it is: the names from the top of the collection down to the folder or list holding it. Empty for the top level.",
});

export const searchContainerSchema = z.object({
  id: z.uuid(),
  kind: z.enum(containerKinds),
  name: z.string(),
  parentId: z.uuid().nullable(),
  location: locationSchema,
});
export type SearchContainer = z.infer<typeof searchContainerSchema>;

export const searchAlbumSchema = albumFieldsSchema.extend({
  id: z.uuid(),
  lists: z.array(z.object({ id: z.uuid(), location: locationSchema })).meta({
    description:
      "The active lists it is in, each located down to the list itself, ordered by that path. Empty means Unsorted.",
  }),
});
export type SearchAlbum = z.infer<typeof searchAlbumSchema>;

const groupOf = <T extends z.ZodType>(item: T) =>
  z.object({
    total: z.int().min(0).meta({ description: "How many match in all." }),
    items: z.array(item).meta({ description: "The best matches, at most `limit`." }),
  });

const ownerSchema = z
  .object({ id: z.uuid(), displayName: z.string().nullable() })
  .meta({ description: "Whose it is." });
const rootIdSchema = z.uuid().meta({
  description:
    "The shared folder or list it's reached through, where its location starts: the highest one the caller can see.",
});

export const sharedSearchContainerSchema = searchContainerSchema.extend({
  parentId: z
    .uuid()
    .nullable()
    .meta({ description: "Its folder, if the caller can see it; else null." }),
  location: locationSchema.meta({
    description:
      "Where it is, from its shared root down to the folder holding it; never a folder the caller can't see. Empty for the root.",
  }),
  rootId: rootIdSchema,
  owner: ownerSchema,
});
export type SharedSearchContainer = z.infer<typeof sharedSearchContainerSchema>;

export const sharedSearchAlbumSchema = searchAlbumSchema.extend({
  owner: ownerSchema,
  lists: z.array(z.object({ id: z.uuid(), location: locationSchema, rootId: rootIdSchema })).meta({
    description:
      "The shared lists it is in that the caller can see, each located from its shared root down to the list, ordered by that path.",
  }),
});
export type SharedSearchAlbum = z.infer<typeof sharedSearchAlbumSchema>;

export const searchResultsSchema = z
  .object({
    folders: groupOf(searchContainerSchema),
    lists: groupOf(searchContainerSchema),
    albums: groupOf(searchAlbumSchema),
    shared: z
      .object({
        folders: groupOf(sharedSearchContainerSchema),
        lists: groupOf(sharedSearchContainerSchema),
        albums: groupOf(sharedSearchAlbumSchema),
      })
      .meta({
        description:
          "What others share with the caller, through accepted invitations and links saved to Shared with me, matched and ordered the same way (FR-12.3).",
      }),
  })
  .meta({
    description:
      "The caller's active folders, lists and albums matching the query by name, title or artist, ignoring case and accents, best first, then what's shared with them (FR-12, TS-50).",
  });
export type SearchResults = z.infer<typeof searchResultsSchema>;
