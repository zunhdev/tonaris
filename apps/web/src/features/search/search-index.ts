// Search over the owned collection on this device (FR-12.1, FR-12.4, FR-12.5; TS-50): folder and list names, album
// titles and artist credits, matched as substrings of their search keys. The client holds only active content, so
// Trash is never searched, and Unsorted is. Results come in DS-75's groups, in the order the server gives too
// (`rankNames` and `rankAlbums`, X-02). Locations are worked out only for the results shown. Pure, so the rules are
// tested without a DOM; the shared parity fixture runs against it (TON-62).

import { rankAlbums, rankNames, searchKey, type Album, type Container } from "@tonaris/domain";

import type { CollectionData } from "../collection/data";
import { ancestorsOf, type Tree } from "../collection/tree";

type ContainerEntry = { container: Container; key: string };
type AlbumEntry = { album: Album; title: string; artist: string };

export type SearchIndex = {
  folders: ContainerEntry[];
  lists: ContainerEntry[];
  albums: AlbumEntry[];
  tree: Tree;
  /** The lists each album is in. */
  listsByAlbum: ReadonlyMap<string, readonly string[]>;
};

type AlbumKeys = { from: [string, string]; title: string; artist: string };

/** Album keys by row, with the text they came from, so a rebuild recomputes only the albums whose text changed. */
const albumKeys = new WeakMap<Album, AlbumKeys>();

function keysOf(album: Album): { title: string; artist: string } {
  let keys = albumKeys.get(album);
  if (keys?.from[0] !== album.title || keys.from[1] !== album.artistCredit) {
    keys = {
      from: [album.title, album.artistCredit],
      title: searchKey(album.title),
      artist: searchKey(album.artistCredit),
    };
    albumKeys.set(album, keys);
  }
  return { title: keys.title, artist: keys.artist };
}

export function buildSearchIndex({
  tree,
  albumsById,
  entriesByList,
}: Pick<CollectionData, "tree" | "albumsById" | "entriesByList">): SearchIndex {
  const folders: ContainerEntry[] = [];
  const lists: ContainerEntry[] = [];
  for (const container of tree.byId.values()) {
    (container.kind === "folder" ? folders : lists).push({
      container,
      key: searchKey(container.name),
    });
  }
  const albums: AlbumEntry[] = [];
  for (const album of albumsById.values()) {
    const { title, artist } = keysOf(album);
    albums.push({ album, title, artist });
  }
  const listsByAlbum = new Map<string, string[]>();
  for (const [listId, entries] of entriesByList) {
    if (!tree.byId.has(listId)) continue;
    for (const { albumId } of entries) {
      const inLists = listsByAlbum.get(albumId);
      if (inLists) inLists.push(listId);
      else listsByAlbum.set(albumId, [listId]);
    }
  }
  return { folders, lists, albums, tree, listsByAlbum };
}

export type SearchResults = {
  folders: Container[];
  lists: Container[];
  albums: Album[];
};

export const noResults: SearchResults = { folders: [], lists: [], albums: [] };

const containersOf = (entries: readonly ContainerEntry[], query: string) =>
  rankNames(
    entries,
    query,
    (entry) => entry.key,
    (entry) => entry.container.id,
  ).map(({ container }) => container);

/** Everything `query` matches, in DS-75's groups, each fully ordered; nothing for a blank query. */
export function search(index: SearchIndex, query: string): SearchResults {
  const key = searchKey(query);
  if (key === "") return noResults;
  return {
    folders: containersOf(index.folders, key),
    lists: containersOf(index.lists, key),
    albums: rankAlbums(
      index.albums,
      key,
      (entry) => entry,
      (entry) => entry.album.id,
    ).map(({ album }) => album),
  };
}

const separator = " › ";

/** Bytewise, as search keys are compared everywhere (TS-12). */
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const pathOf = (tree: Tree, container: Container) =>
  [...ancestorsOf(tree, container.id), container].map(({ name }) => name).join(separator);

/** Where a folder or list is (DS-75): the folders above it, or "Collection" at the top. */
export function containerLocation(tree: Tree, container: Container): string {
  return (
    ancestorsOf(tree, container.id)
      .map(({ name }) => name)
      .join(separator) || "Collection"
  );
}

/**
 * Where an album is, and where it opens (decided with the creator, 28 October 2026): the alphabetically first path
 * of its lists, with how many others it is in, or Unsorted when it is in none.
 */
export type AlbumPlace = { listId: string | undefined; path: string; others: number };

export function albumPlace(index: SearchIndex, albumId: string): AlbumPlace {
  const paths: { listId: string; path: string; key: string }[] = [];
  for (const listId of index.listsByAlbum.get(albumId) ?? []) {
    const list = index.tree.byId.get(listId);
    if (!list) continue;
    const path = pathOf(index.tree, list);
    paths.push({ listId, path, key: searchKey(path) });
  }
  paths.sort((a, b) => byKey(a.key, b.key) || byKey(a.listId, b.listId));
  const [first] = paths;
  if (!first) return { listId: undefined, path: "Unsorted", others: 0 };
  return { listId: first.listId, path: first.path, others: paths.length - 1 };
}
