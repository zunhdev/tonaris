// Server search (FR-12.1, FR-12.3–FR-12.5, X-02; TS-50), for the API, MCP and the palette's shared results: the
// owner's active folders, lists and albums whose stored search keys contain the query's, found through their pg_trgm
// indexes, and then what others share with them, as the access rules decide it (access.ts). The matches are ranked by
// the same functions as the app's (`rankNames`, `rankAlbums`), so both list the same things in the same order; SQL
// can't promise JavaScript's word boundaries. Each group keeps its total and its first `limit`, with where each result
// is. A shared result is located from the highest shared folder or list the person can see, so a private ancestor is
// never named. Trash, and anything not shared with them, never match.

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  rankAlbums,
  rankNames,
  searchKey,
  type SearchAlbum,
  type SearchContainer,
  type SearchResults,
  type SharedSearchAlbum,
  type SharedSearchContainer,
} from "@tonaris/domain";

import { readableContainers } from "./access";
import type { Database } from "./client";
import { albums, containers, memberships, users } from "./schema";

/** `%`, `_` and `\` match literally in a LIKE pattern. */
export const likeLiteral = (text: string) =>
  text.replace(/[\\%_]/g, (character) => `\\${character}`);

const none = { total: 0, items: [] };
const nothingShared: SearchResults["shared"] = { folders: none, lists: none, albums: none };
const nothing: SearchResults = { folders: none, lists: none, albums: none, shared: nothingShared };

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

  const [places, matchedContainers, matchedAlbums, shared] = await Promise.all([
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
    sharedResults(db, { viewerId: ownerId, key, pattern, limit }),
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
    shared,
  };
}

/**
 * What others share with `viewerId` matching `key` (FR-12.3): the containers they read through sharing and the active
 * albums in those lists, each with its owner and the highest shared container it's reached through, located over the
 * readable containers alone.
 */
async function sharedResults(
  db: Database,
  {
    viewerId,
    key,
    pattern,
    limit,
  }: { viewerId: string; key: string; pattern: string; limit: number },
): Promise<SearchResults["shared"]> {
  const readable = await readableContainers(db, { kind: "person", userId: viewerId });
  if (readable.size === 0) return nothingShared;
  const ids = [...readable.keys()];
  const [rows, matchedContainers, matchedAlbums] = await Promise.all([
    db
      .select({
        id: containers.id,
        kind: containers.kind,
        name: containers.name,
        parentId: containers.parentId,
        ownerId: containers.ownerId,
        ownerName: users.displayName,
      })
      .from(containers)
      .innerJoin(users, eq(users.id, containers.ownerId))
      .where(inArray(containers.id, ids)),
    db
      .select({ id: containers.id, key: containers.searchNameKey })
      .from(containers)
      .where(and(inArray(containers.id, ids), sql`${containers.searchNameKey} like ${pattern}`)),
    db
      .selectDistinct({
        id: albums.id,
        title: albums.searchTitleKey,
        artist: albums.searchArtistKey,
      })
      .from(albums)
      .innerJoin(memberships, eq(memberships.albumId, albums.id))
      .where(
        and(
          inArray(memberships.listId, ids),
          isNull(albums.trashedAt),
          or(
            sql`${albums.searchTitleKey} like ${pattern}`,
            sql`${albums.searchArtistKey} like ${pattern}`,
          ),
        ),
      ),
  ]);
  // Only what the viewer reads: a walk up stops below anything private.
  const places = new Map(rows.map((row) => [row.id, row]));
  const rootOf = (id: string) => {
    let at = places.get(id);
    for (
      let steps = 0;
      at?.parentId && places.has(at.parentId) && steps < places.size;
      steps += 1
    ) {
      at = places.get(at.parentId);
    }
    return at?.id ?? id;
  };
  const ownerOf = (id: string) => {
    const row = places.get(id);
    return { id: row?.ownerId ?? "", displayName: row?.ownerName ?? null };
  };

  const ranked = rankNames(
    matchedContainers,
    key,
    (row) => row.key,
    (row) => row.id,
  );
  const containerGroup = (kind: Place["kind"]) => {
    const all = ranked.flatMap(({ id }) => {
      const place = places.get(id);
      return place?.kind === kind ? [place] : [];
    });
    const items = all.slice(0, limit).map(({ id, name, parentId }): SharedSearchContainer => {
      const seen = parentId !== null && places.has(parentId);
      return {
        id,
        kind,
        name,
        parentId: seen ? parentId : null,
        location: seen ? pathTo(places, parentId) : [],
        rootId: rootOf(id),
        owner: ownerOf(id),
      };
    });
    return { total: all.length, items };
  };

  const rankedAlbums = rankAlbums(
    matchedAlbums,
    key,
    (row) => row,
    (row) => row.id,
  );
  const shown = await albumsOf(
    db,
    rankedAlbums.slice(0, limit).map(({ id }) => id),
    places,
  );
  return {
    folders: containerGroup("folder"),
    lists: containerGroup("list"),
    albums: {
      total: rankedAlbums.length,
      items: shown.map((album): SharedSearchAlbum =>
        Object.assign(album, {
          owner: ownerOf(album.lists[0]?.id ?? ""),
          lists: album.lists.map((list) => Object.assign(list, { rootId: rootOf(list.id) })),
        }),
      ),
    },
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
