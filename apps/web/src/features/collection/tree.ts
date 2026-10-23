// The sidebar tree's model (DS-27, DS-31, FR-01.3): the owner's folders and lists, nested as saved, then Unsorted,
// Shared with me and Trash. Each level comes in the order its folder's view is sorted, and the top level in the
// root's (decided 23 October 2026); without one, in creation order, which their client-made UUIDv7 IDs sort by
// (DS-44's fallback for manual order). The rows a person can see follow which folders are expanded, and
// carry what the ARIA tree pattern needs in its flat form: level, position in the set, and set size. Pure, so the
// tree's rules are tested without a DOM.

import { searchKey, type Container } from "@tonaris/domain";

export type Tree = {
  /** The root's folders and lists, in order. */
  roots: Container[];
  /** Each folder's folders and lists, in order. */
  children: Map<string, Container[]>;
  byId: Map<string, Container>;
};

const byCreation = (a: Container, b: Container) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Orders the folders and lists in a folder, or at the root (`parentId` null). */
export type SiblingOrder = (siblings: Container[], parentId: string | null) => Container[];

export function buildTree(
  containers: Iterable<Container>,
  order: SiblingOrder = (siblings) => siblings.toSorted(byCreation),
): Tree {
  const byId = new Map<string, Container>();
  const children = new Map<string, Container[]>();
  const roots: Container[] = [];
  for (const container of containers) byId.set(container.id, container);
  for (const container of byId.values()) {
    if (container.parentId === null) roots.push(container);
    else children.set(container.parentId, [...(children.get(container.parentId) ?? []), container]);
  }
  for (const [parentId, siblings] of children) children.set(parentId, order(siblings, parentId));
  return { roots: order(roots, null), children, byId };
}

/** The places below the folders and lists, in order (DS-31). */
export const places = [
  { place: "unsorted", name: "Unsorted" },
  { place: "shared", name: "Shared with me" },
  { place: "trash", name: "Trash" },
] as const;

export type Place = (typeof places)[number]["place"];

type Position = { level: number; posInSet: number; setSize: number };

export type TreeRow =
  | (Position & { type: "container"; container: Container; expanded: boolean })
  | (Position & { type: "place"; place: Place; name: string });

/** The rows a person can see: the folders and lists, inside the expanded folders, then the places. */
export function visibleRows(tree: Tree, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const topLevel = tree.roots.length + places.length;
  const walk = (siblings: readonly Container[], level: number, setSize: number) => {
    for (const [index, container] of siblings.entries()) {
      const open = container.kind === "folder" && expanded.has(container.id);
      rows.push({
        type: "container",
        container,
        expanded: open,
        level,
        posInSet: index + 1,
        setSize,
      });
      if (open) {
        const inside = tree.children.get(container.id) ?? [];
        walk(inside, level + 1, inside.length);
      }
    }
  };
  walk(tree.roots, 1, topLevel);
  for (const [index, { place, name }] of places.entries()) {
    rows.push({
      type: "place",
      place,
      name,
      level: 1,
      posInSet: tree.roots.length + index + 1,
      setSize: topLevel,
    });
  }
  return rows;
}

/** The folders above the container `id`, from the root down; empty for a root container or an unknown ID. */
export function ancestorsOf(tree: Tree, id: string): Container[] {
  const path: Container[] = [];
  let parentId = tree.byId.get(id)?.parentId ?? null;
  // A parent never repeats in a sound tree; the guard stops on data that would loop.
  while (parentId !== null && path.length <= tree.byId.size) {
    const parent = tree.byId.get(parentId);
    if (!parent) break;
    path.unshift(parent);
    parentId = parent.parentId;
  }
  return path;
}

const nameOf = (row: TreeRow) => (row.type === "container" ? row.container.name : row.name);

/**
 * The next row after `from` whose name starts with `typed`, ignoring case and accents (DS-27, FR-12.5), wrapping
 * around to the start. A single repeated letter cycles through the rows starting with it.
 */
export function typeAhead(
  rows: readonly TreeRow[],
  from: number,
  typed: string,
): number | undefined {
  const key = searchKey(typed);
  if (!key) return undefined;
  // One letter, or the same letter typed again and again.
  const repeated = /^(.)\1*$/u.exec(key)?.[1];
  // Typing more letters stays on a row that still matches; a repeated letter moves on.
  const start = repeated === undefined ? from : from + 1;
  for (let offset = 0; offset < rows.length; offset += 1) {
    const index = (start + offset) % rows.length;
    const row = rows[index];
    if (!row) continue;
    const name = searchKey(nameOf(row));
    if (name.startsWith(repeated ?? key)) return index;
  }
  return undefined;
}
