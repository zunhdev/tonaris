// The covers a folder's or list's card fans out (DS-41, TON-174): a list's first albums in the list's own order, as
// its person presents it (sort, grouping and manual order); a folder's, the first albums found in its folders and
// lists, top to bottom in the folder's own order. Pure, so the order is tested without a DOM.

import {
  entryOrder,
  presentationOf,
  type Album,
  type Container,
  type Membership,
  type ViewDefaults,
  type ViewPrefs,
} from "@tonaris/domain";

import { sections, sortAlbums, sortContainers, type Keys } from "./order";
import type { Tree } from "./tree";

export type CoverSources = {
  tree: Pick<Tree, "children">;
  entriesByList: ReadonlyMap<string, readonly Membership[]>;
  albumsById: ReadonlyMap<string, Album>;
  views: ReadonlyMap<string, ViewPrefs>;
  defaults: ViewDefaults;
  keys: ReadonlyMap<string, Keys>;
};

/** The albums a list shows, in its own order. */
export function listOrder(listId: string, sources: CoverSources): Album[] {
  const added = (sources.entriesByList.get(listId) ?? [])
    .toSorted(entryOrder)
    .flatMap((entry) => sources.albumsById.get(entry.albumId) ?? []);
  const { sortMode, sortDir, grouped } = presentationOf(
    "albums",
    sources.views.get(listId),
    sources.defaults,
  );
  const sorted = sortAlbums(added, { mode: sortMode, dir: sortDir }, sources.keys.get(listId));
  return sections(sorted, grouped).flatMap((section) => section.albums);
}

/** Where covers come from: a folder's folders and lists, and a list's albums, each in its shown order. */
export type CoverSource<A> = {
  children: (folderId: string) => readonly Pick<Container, "id" | "kind">[];
  albums: (listId: string) => readonly A[];
};

/** The first `limit` albums of a list, or found in a folder's folders and lists, top to bottom. */
export function coversIn<A>(
  container: Pick<Container, "id" | "kind">,
  source: CoverSource<A>,
  limit = 3,
): A[] {
  if (container.kind === "list") return source.albums(container.id).slice(0, limit);
  const found: A[] = [];
  for (const child of source.children(container.id)) {
    if (found.length >= limit) break;
    found.push(...coversIn(child, source, limit - found.length));
  }
  return found;
}

/** The owner's covers: each view in its person's presentation. */
export function coversOf(
  container: Pick<Container, "id" | "kind">,
  sources: CoverSources,
  limit = 3,
): Album[] {
  return coversIn(
    container,
    {
      children: (folderId) => {
        const { sortMode, sortDir } = presentationOf(
          "containers",
          sources.views.get(folderId),
          sources.defaults,
        );
        return sortContainers(
          sources.tree.children.get(folderId) ?? [],
          { mode: sortMode, dir: sortDir },
          sources.keys.get(folderId),
        );
      },
      albums: (listId) => listOrder(listId, sources),
    },
    limit,
  );
}
