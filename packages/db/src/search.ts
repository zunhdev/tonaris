// Server search (FR-12.1, FR-12.4, FR-12.5, X-02; TS-50), for the API and MCP: the owner's active folders, lists and
// albums whose stored search keys contain the query's, found through their pg_trgm indexes. The matches are ranked
// by the same functions as the app's (`rankNames`, `rankAlbums`), so both list the same things in the same order;
// SQL can't promise JavaScript's word boundaries. Each group keeps its total and its first `limit`, with where each
// result is. Trash and other accounts' content never match.

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  rankAlbums,
  rankNames,
  searchKey,
  type SearchAlbum,
  type SearchContainer,
  type SearchResults,
} from "@tonaris/domain";

import type { Database } from "./client";
import { albums, containers, memberships } from "./schema";

/** `%`, `_` and `\` match literally in a LIKE pattern. */
export const likeLiteral = (text: string) =>
  text.replace(/[\\%_]/g, (character) => `\\${character}`);

const nothing: SearchResults = {
  folders: { total: 0, items: [] },
  lists: { total: 0, items: [] },
  albums: { total: 0, items: [] },
};

type Place = { id: string; kind: "folder" | "list"; name: string; parentId: string | null };

/** The names from the top of the collection down to `id`, itself included. */
function pathTo(places: ReadonlyMap<string, Place>, id: string): string[] {
  const path: string[] = [];
  // A parent never repeats in a sound tree; the guard stops on data that would loop.
  for (let at = places.get(id); at && path.length <= places.size;) {
    path.unshift(at.name);
    at = at.parentId === null ? undefined : places.get(at.parentId);
  }
  return path;
}

/** Bytewise, as search keys are compared everywhere (TS-12). */
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function searchCollection(
  db: Database,
  { ownerId, query, limit }: { ownerId: string; query: string; limit: number },
): Promise<SearchResults> {
  const key = searchKey(query);
  if (key === "") return nothing;
  const pattern = `%${likeLiteral(key)}%`;

  const [places, matchedContainers, matchedAlbums] = await Promise.all([
    db
      .select({
        id: containers.id,
        kind: containers.kind,
        name: containers.name,
        parentId: containers.parentId,
      })
      .from(containers)
      .where(and(eq(containers.ownerId, ownerId), isNull(containers.trashedAt))),
    db
      .select({ id: containers.id, key: containers.searchNameKey })
      .from(containers)
      .where(
        and(
          eq(containers.ownerId, ownerId),
          isNull(containers.trashedAt),
          sql`${containers.searchNameKey} like ${pattern}`,
        ),
      ),
    db
      .select({ id: albums.id, title: albums.searchTitleKey, artist: albums.searchArtistKey })
      .from(albums)
      .where(
        and(
          eq(albums.ownerId, ownerId),
          isNull(albums.trashedAt),
          or(
            sql`${albums.searchTitleKey} like ${pattern}`,
            sql`${albums.searchArtistKey} like ${pattern}`,
          ),
        ),
      ),
  ]);
  const byId = new Map(places.map((place) => [place.id, place]));

  const ranked = rankNames(
    matchedContainers,
    key,
    (row) => row.key,
    (row) => row.id,
  );
  const containerGroup = (kind: Place["kind"]) => {
    const all = ranked.flatMap(({ id }) => {
      const place = byId.get(id);
      return place?.kind === kind ? [place] : [];
    });
    const items = all.slice(0, limit).map(({ id, name, parentId }): SearchContainer => ({
      id,
      kind,
      name,
      parentId,
      location: parentId === null ? [] : pathTo(byId, parentId),
    }));
    return { total: all.length, items };
  };

  const rankedAlbums = rankAlbums(
    matchedAlbums,
    key,
    (row) => row,
    (row) => row.id,
  );
  const shownIds = rankedAlbums.slice(0, limit).map(({ id }) => id);
  return {
    folders: containerGroup("folder"),
    lists: containerGroup("list"),
    albums: { total: rankedAlbums.length, items: await albumsOf(db, shownIds, byId) },
  };
}

/** The albums `ids`, in that order, each with its active lists ordered by path. */
async function albumsOf(
  db: Database,
  ids: readonly string[],
  places: ReadonlyMap<string, Place>,
): Promise<SearchAlbum[]> {
  if (ids.length === 0) return [];
  const [rows, entries] = await Promise.all([
    db
      .select({
        id: albums.id,
        title: albums.title,
        artistCredit: albums.artistCredit,
        releaseType: albums.releaseType,
        isLive: albums.isLive,
        originalYear: albums.originalYear,
        recordingYearStart: albums.recordingYearStart,
        recordingYearEnd: albums.recordingYearEnd,
      })
      .from(albums)
      .where(inArray(albums.id, [...ids])),
    db
      .select({ albumId: memberships.albumId, listId: memberships.listId })
      .from(memberships)
      .where(inArray(memberships.albumId, [...ids]))
      .orderBy(asc(memberships.listId)),
  ]);
  const listsOf = new Map<string, { id: string; location: string[]; key: string }[]>();
  for (const { albumId, listId } of entries) {
    // Lists in Trash aren't among the places, so their entries don't count (TS-13).
    if (places.get(listId)?.kind !== "list") continue;
    const location = pathTo(places, listId);
    const list = { id: listId, location, key: searchKey(location.join(" › ")) };
    listsOf.set(albumId, [...(listsOf.get(albumId) ?? []), list]);
  }
  const found = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const album = found.get(id);
    if (!album) return [];
    const lists = (listsOf.get(id) ?? [])
      .toSorted((a, b) => byKey(a.key, b.key) || byKey(a.id, b.id))
      .map(({ id: listId, location }) => ({ id: listId, location }));
    return [{ ...album, lists }];
  });
}
