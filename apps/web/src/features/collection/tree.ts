// The sidebar tree's model (DS-27, DS-31, FR-01.3): the owner's folders and lists, nested as saved, then Unsorted,
// Shared with me and Trash. Each level comes in the order its folder's view is sorted, and the top level in the
// root's (decided 23 October 2026); without one, in creation order, which their client-made UUIDv7 IDs sort by
// (DS-44's fallback for manual order). The rows a person can see follow which folders are expanded, and
// carry what the ARIA tree pattern needs in its flat form: level, position in the set, and set size. Shared with me
// holds the folders and lists shared with the person, each with what's inside it (TON-130). Pure, so the tree's rules
// are tested without a DOM.

import { searchKey, type Container, type ContainerKind, type SharedEntry } from "@tonaris/domain";

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
  // Only while invitations are pending (DS-31).
  { place: "invitations", name: "Invitations" },
  // Only while AI clients' requests wait for approval (DS-86, TS-64).
  { place: "approvals", name: "Approvals" },
  { place: "trash", name: "Trash" },
] as const;

export type Place = (typeof places)[number]["place"];

/** A folder or list shared with the person, at the top of Shared with me or inside one there (TON-130). */
export type SharedItem = {
  id: string;
  /** The shared folder or list it is in, or its own ID at the top. */
  rootId: string;
  /** The folder above it in the share, or null at the top. */
  parentId: string | null;
  /** Null while it can't be opened, as its name. */
  kind: ContainerKind | null;
  name: string | null;
  /** Its owner's display name, shown after a top one. */
  owner: string | undefined;
  available: boolean;
};

/** A folder or list inside a share, which can always be opened. */
export type SharedChild = SharedItem & { kind: ContainerKind; name: string };

export type SharedTree = {
  roots: SharedItem[];
  children: Map<string, SharedChild[]>;
  byId: Map<string, SharedItem>;
};

/**
 * Shared with me as a tree: the shared folders and lists by name, those that can't be opened last, each holding what
 * is inside it, in `order` like the person's own (decided 23 October 2026).
 */
export function buildSharedTree(
  entries: readonly SharedEntry[],
  order: (siblings: SharedChild[], parentId: string) => SharedChild[] = (siblings) => siblings,
): SharedTree {
  const byId = new Map<string, SharedItem>();
  const children = new Map<string, SharedChild[]>();
  const roots = entries
    .map((entry): SharedItem => ({
      id: entry.containerId,
      rootId: entry.containerId,
      parentId: null,
      kind: entry.kind,
      name: entry.name,
      owner: entry.owner.displayName ?? "A Tonaris member",
      available: entry.available,
    }))
    .toSorted(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        searchKey(a.name ?? "").localeCompare(searchKey(b.name ?? "")) ||
        (a.owner ?? "").localeCompare(b.owner ?? ""),
    );
  for (const root of roots) byId.set(root.id, root);
  for (const entry of entries) {
    for (const { id, kind, parentId, name } of entry.containers) {
      // A folder shared on its own and inside another share shows in both; the first one found holds it.
      if (byId.has(id) || parentId === null) continue;
      const item: SharedChild = {
        id,
        rootId: entry.containerId,
        parentId,
        kind,
        name,
        owner: undefined,
        available: true,
      };
      byId.set(id, item);
      children.set(parentId, [...(children.get(parentId) ?? []), item]);
    }
  }
  for (const [parentId, siblings] of children) children.set(parentId, order(siblings, parentId));
  return { roots, children, byId };
}

/** Shared with me's open or closed state, kept with the expanded folders: it starts open (TON-130). */
export const sharedClosedKey = "shared:closed";

type Position = { level: number; posInSet: number; setSize: number };

export type TreeRow =
  | (Position & { type: "container"; container: Container; expanded: boolean })
  | (Position & {
      type: "place";
      place: Place;
      name: string;
      /** Only Shared with me opens, while something is shared (TON-130). */
      expanded?: boolean;
    })
  | (Position & { type: "shared"; item: SharedItem; expanded: boolean });

/**
 * The rows a person can see: the folders and lists, inside the expanded folders, then the places, Invitations and
 * Approvals only while some are pending (DS-31, DS-86). Shared with me, while open, holds what's shared, inside the
 * expanded shared folders (TON-130).
 */
export function visibleRows(
  tree: Tree,
  expanded: ReadonlySet<string>,
  {
    invitations = false,
    approvals = false,
    shared,
  }: { invitations?: boolean; approvals?: boolean; shared?: SharedTree } = {},
): TreeRow[] {
  const rows: TreeRow[] = [];
  const shown = places.filter(
    ({ place }) => (place !== "invitations" || invitations) && (place !== "approvals" || approvals),
  );
  const topLevel = tree.roots.length + shown.length;
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
  const walkShared = (siblings: readonly SharedItem[], level: number) => {
    for (const [index, item] of siblings.entries()) {
      const open = item.kind === "folder" && item.available && expanded.has(item.id);
      rows.push({
        type: "shared",
        item,
        expanded: open,
        level,
        posInSet: index + 1,
        setSize: siblings.length,
      });
      if (open) walkShared(shared?.children.get(item.id) ?? [], level + 1);
    }
  };
  walk(tree.roots, 1, topLevel);
  for (const [index, { place, name }] of shown.entries()) {
    const opens = place === "shared" && (shared?.roots.length ?? 0) > 0;
    const open = opens && !expanded.has(sharedClosedKey);
    rows.push({
      type: "place",
      place,
      name,
      ...(opens ? { expanded: open } : {}),
      level: 1,
      posInSet: tree.roots.length + index + 1,
      setSize: topLevel,
    });
    if (open) walkShared(shared?.roots ?? [], 2);
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

const nameOf = (row: TreeRow) =>
  row.type === "container"
    ? row.container.name
    : row.type === "shared"
      ? (row.item.name ?? "")
      : row.name;

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

/**
 * Whether the folder or list `id` can move into `parentId`, null being the root (FR-01.4, FR-01.5): a folder, not
 * the item itself nor anything under it, and not where it is already. The domain still checks names and depth.
 */
export function canMoveInto(tree: Tree, id: string, parentId: string | null): boolean {
  const item = tree.byId.get(id);
  if (!item || item.parentId === parentId) return false;
  if (parentId === null) return true;
  const parent = tree.byId.get(parentId);
  if (!parent || parent.kind !== "folder" || parentId === id) return false;
  return !ancestorsOf(tree, parentId).some((folder) => folder.id === id);
}

/** A place the M picker offers: the root, or a folder at its level in the tree. */
export type Destination = { parentId: string | null; name: string; level: number };

/** Where `id` can move, for the M picker (DS-49): Collection, then the folders in the tree's order. */
export function moveDestinations(tree: Tree, id: string): Destination[] {
  const found: Destination[] = [];
  if (canMoveInto(tree, id, null)) found.push({ parentId: null, name: "Collection", level: 0 });
  const walk = (siblings: readonly Container[], level: number) => {
    for (const folder of siblings) {
      // Nothing under the item itself can take it.
      if (folder.kind !== "folder" || folder.id === id) continue;
      if (canMoveInto(tree, id, folder.id)) {
        found.push({ parentId: folder.id, name: folder.name, level });
      }
      walk(tree.children.get(folder.id) ?? [], level + 1);
    }
  };
  walk(tree.roots, 1);
  return found;
}
