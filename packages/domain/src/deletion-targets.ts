// What deleting folders, lists and albums to Trash does (FR-01.11, FR-14.1, FR-07.14, FR-10.6), for `delete_items`'
// approval: which requested folders and lists are roots, what goes with each, which albums fall to Unsorted, who
// stops seeing it, and which IDs name nothing active of the owner's. Pure, over what storage reads in the transaction.

import type { AlbumDeletionTarget, DeletionTargets } from "./approvals";
import { chainOf, subtreeOf, treeOf } from "./container-tree";
import type { ContainerKind } from "./containers";
import { deletionImpact, type ImpactState } from "./sharing-impact";

/** One of the owner's active folders and lists, as a deletion reads them. */
export type DeletionPlace = {
  id: string;
  kind: ContainerKind;
  name: string;
  parentId: string | null;
};

/**
 * The deletion of `containerIds` among the active `places`: its roots, the requested containers not inside another
 * requested one, which takes them with it; and everything the roots take.
 */
function deletionOf(places: readonly DeletionPlace[], containerIds: readonly string[]) {
  const tree = treeOf(places);
  const asked = new Set(containerIds.filter((id) => tree.byId.has(id)));
  const roots = [...asked].filter(
    (id) => !chainOf(tree, tree.byId.get(id)?.parentId ?? null).some((at) => asked.has(at)),
  );
  const deleted = new Set(roots.flatMap((id) => subtreeOf(tree, id)));
  return { tree, asked, roots, deleted };
}

/** The lists deleting `containerIds` takes, inside folders too: their entries decide which albums go to Unsorted. */
export function deletedListsOf(
  places: readonly DeletionPlace[],
  containerIds: readonly string[],
): string[] {
  const { tree, deleted } = deletionOf(places, containerIds);
  return [...deleted].filter((id) => tree.byId.get(id)?.kind === "list");
}

/**
 * What deleting `albumIds` and `containerIds` to Trash would do, from the owner's active `places`, the active
 * `albums` among `albumIds` with the lists each leaves, the `entries` of the active albums in `deletedListsOf`'s lists,
 * and the owner's sharing: each root with what goes with it, the albums left in no list, which go to Unsorted, and
 * who no longer sees it. A container inside another one deleted goes with it, so it is left out. `missing` names
 * the IDs that are nothing active of the owner's.
 */
export function deletionTargetsOf({
  places,
  albums,
  albumIds,
  containerIds,
  entries,
  state,
}: {
  places: readonly DeletionPlace[];
  albums: readonly AlbumDeletionTarget[];
  albumIds: readonly string[];
  containerIds: readonly string[];
  entries: readonly { albumId: string; listId: string }[];
  state: ImpactState;
}): DeletionTargets & { missing: string[]; containerIds: string[] } {
  const { tree, asked, roots, deleted } = deletionOf(places, containerIds);
  const containers = roots.map((id) => {
    const below = subtreeOf(tree, id).slice(1);
    const place = tree.byId.get(id);
    return {
      id,
      kind: place?.kind ?? "list",
      name: place?.name ?? "",
      folders: below.filter((each) => tree.byId.get(each)?.kind === "folder").length,
      lists: below.filter((each) => tree.byId.get(each)?.kind === "list").length,
    };
  });

  // Albums in the deleted lists that are in no other active list go to Unsorted, unless they are deleted too.
  const goingToo = new Set(albums.map((album) => album.id));
  let unsorted = 0;
  for (const [albumId, lists] of Map.groupBy(entries, (entry) => entry.albumId)) {
    if (goingToo.has(albumId)) continue;
    if (lists.every((entry) => deleted.has(entry.listId) || !tree.byId.has(entry.listId)))
      unsorted += 1;
  }

  const sharing = deletionImpact(state, {
    containerIds: roots,
    albumListIds: albums.flatMap((album) => album.lists.map((list) => list.id)),
  });
  const found = new Set([...albums.map((album) => album.id), ...asked]);
  return {
    albums,
    containers,
    unsorted,
    sharing,
    containerIds: roots,
    missing: [...albumIds, ...containerIds].filter((id) => !found.has(id)),
  };
}
