// The sidebar tree's model (DS-27, DS-31, FR-01.3): the owner's folders and lists, nested as saved, then Unsorted,
// Shared with me and Trash. Siblings come in creation order, which their client-made UUIDv7 IDs sort by, until
// manual order exists (DS-44's fallback; TON-36). The rows a person can see follow which folders are expanded, and
// carry what the ARIA tree pattern needs in its flat form: level, position in the set, and set size. Pure, so the
// tree's rules are tested without a DOM.

import { searchKey, type Album, type Container, type Membership } from "@tonaris/domain";

export type Tree = {
  /** The root's folders and lists, in order. */
  roots: Container[];
  /** Each folder's folders and lists, in order. */
  children: Map<string, Container[]>;
  byId: Map<string, Container>;
};

const byCreation = (a: Container, b: Container) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildTree(containers: Iterable<Container>): Tree {
  const byId = new Map<string, Container>();
  const children = new Map<string, Container[]>();
  const roots: Container[] = [];
  for (const container of containers) byId.set(container.id, container);
  for (const container of byId.values()) {
    if (container.parentId === null) roots.push(container);
    else children.set(container.parentId, [...(children.get(container.parentId) ?? []), container]);
  }
  roots.sort(byCreation);
  for (const siblings of children.values()) siblings.sort(byCreation);
  return { roots, children, byId };
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

/** How many albums each list holds. */
export function albumCounts(memberships: Iterable<Membership>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { listId } of memberships) counts.set(listId, (counts.get(listId) ?? 0) + 1);
  return counts;
}

/** How many albums are in no list: Unsorted (FR-01.9). */
export function unsortedCount(albums: Iterable<Album>, memberships: Iterable<Membership>): number {
  const listed = new Set<string>();
  for (const { albumId } of memberships) listed.add(albumId);
  let count = 0;
  for (const { id } of albums) if (!listed.has(id)) count += 1;
  return count;
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
