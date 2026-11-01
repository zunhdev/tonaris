// Walks over an owner's folders and lists held in memory (TS-31), as storage walks them in SQL with recursive CTEs:
// up from a container through the folders above it, and down to its descendants out of Trash. Both stop at a cycle
// in damaged data instead of running away.

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
