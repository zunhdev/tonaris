// Walks over an owner's folders and lists held in memory (TS-31), as storage walks them in SQL with recursive CTEs:
// up from a container through the folders above it, and down to its descendants out of Trash. Both stop at a cycle
// in damaged data instead of running away. The web app walks its own synced folders and lists with them too, so its
// move checks and deletions follow the commands' rules (X-02, DRIFT-021).

import { maxContainerDepth } from "./limits";

/** A folder or list as the walks see it. */
export type TreeNode = { id: string; parentId: string | null; trashed?: boolean };

/** Containers indexed for the walks: each by its ID, and each one's children out of Trash, in the order given. */
export type Tree<T extends TreeNode = TreeNode> = {
  byId: ReadonlyMap<string, T>;
  children: ReadonlyMap<string, readonly string[]>;
};

/** Indexes `containers` for the walks. */
export function treeOf<T extends TreeNode>(containers: readonly T[]): Tree<T> {
  const byId = new Map(containers.map((container) => [container.id, container]));
  const children = new Map<string, string[]>();
  for (const container of containers) {
    if (container.parentId === null || container.trashed) continue;
    const siblings = children.get(container.parentId);
    if (siblings) siblings.push(container.id);
    else children.set(container.parentId, [container.id]);
  }
  return { byId, children };
}

/** `parentId` and the folders above it, nearest first; none for the root. A parent not in the tree ends it. */
export function chainOf(tree: Tree, parentId: string | null): string[] {
  const chain: string[] = [];
  for (let id = parentId; id !== null && !chain.includes(id);) {
    chain.push(id);
    id = tree.byId.get(id)?.parentId ?? null;
  }
  return chain;
}

/** `id` and its descendants out of Trash, breadth-first. */
export function subtreeOf(tree: Tree, id: string): string[] {
  const ids = [id];
  const seen = new Set(ids);
  for (let at = 0; at < ids.length; at += 1) {
    for (const child of tree.children.get(ids[at] ?? "") ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      ids.push(child);
    }
  }
  return ids;
}

/** How many levels `id` and what is under it take: 1 for a list or an empty folder, as storage's `subtreeDepth`. */
export function subtreeDepthOf(tree: Tree, id: string): number {
  let depth = 0;
  let level = tree.byId.has(id) ? [id] : [];
  const seen = new Set(level);
  while (level.length > 0) {
    depth += 1;
    const next: string[] = [];
    for (const at of level) {
      for (const child of tree.children.get(at) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        next.push(child);
      }
    }
    level = next;
  }
  return depth;
}

/**
 * Whether putting `levels` of folders and lists under `levelsAbove` folders goes past the nesting limit (FR-01.4): for
 * a new one (1 level), a move (its subtree's depth) and a recovery, in the commands and in the app alike.
 */
export const exceedsMaxDepth = (levelsAbove: number, levels: number): boolean =>
  levelsAbove + levels > maxContainerDepth;

/**
 * Why the folder or list `id` can't move under the folder `parentId` (null: the top level), from the walks alone, as
 * `container.move` decides (FR-01.4, FR-01.5): into itself or a folder inside it, or past the nesting limit. The
 * command also checks that `parentId` is an active folder, the names there, and shares.
 */
export function moveProblem(
  tree: Tree,
  id: string,
  parentId: string | null,
): "cycle" | "too_deep" | undefined {
  const path = chainOf(tree, parentId);
  if (path.includes(id)) return "cycle";
  if (exceedsMaxDepth(path.length, subtreeDepthOf(tree, id))) return "too_deep";
  return undefined;
}

/** The ones of `ids` in the tree and inside none of the others: deleting them takes the rest along (FR-01.13). */
export function rootsAmong(tree: Tree, ids: readonly string[]): string[] {
  const asked = new Set(ids.filter((id) => tree.byId.has(id)));
  return [...asked].filter(
    (id) => !chainOf(tree, tree.byId.get(id)?.parentId ?? null).some((at) => asked.has(at)),
  );
}
