// The sidebar tree's model (DS-27, DS-31, FR-01.3).

import { describe, expect, test } from "bun:test";

import { uuidv7, type Container, type SharedEntry } from "@tonaris/domain";

import {
  ancestorsOf,
  buildSharedTree,
  buildTree,
  canMoveInto,
  moveDestinations,
  sharedClosedKey,
  typeAhead,
  visibleRows,
  type TreeRow,
} from "./tree";

const folder = (name: string, parentId: string | null = null): Container => ({
  id: uuidv7(),
  kind: "folder",
  parentId,
  name,
  description: null,
});
const list = (name: string, parentId: string | null = null): Container => ({
  ...folder(name, parentId),
  kind: "list",
});

const nameOf = (row: TreeRow | undefined) =>
  row?.type === "container"
    ? row.container.name
    : row?.type === "shared"
      ? (row.item.name ?? "(unavailable)")
      : row?.name;
const label = (row: TreeRow) =>
  `${"  ".repeat(row.level - 1)}${nameOf(row)} ${row.posInSet}/${row.setSize}`;

// Made in this order, so their IDs sort this way.
const metal = folder("Metal");
const doom = list("Doom", metal.id);
const funeral = folder("Funeral", metal.id);
const deep = list("Deep", funeral.id);
const later = list("Later");

const byName = <T extends { name: string }>(siblings: T[]) =>
  siblings.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

describe("the sidebar tree (DS-27)", () => {
  test("siblings come in creation order, and only expanded folders show what they hold", () => {
    const tree = buildTree([later, deep, funeral, doom, metal]);
    expect(visibleRows(tree, new Set()).map(label)).toEqual([
      "Metal 1/5",
      "Later 2/5",
      "Unsorted 3/5",
      "Shared with me 4/5",
      "Trash 5/5",
    ]);
    expect(visibleRows(tree, new Set([metal.id, funeral.id])).map(label)).toEqual([
      "Metal 1/5",
      "  Doom 1/2",
      "  Funeral 2/2",
      "    Deep 1/1",
      "Later 2/5",
      "Unsorted 3/5",
      "Shared with me 4/5",
      "Trash 5/5",
    ]);
    // A folder inside a collapsed one stays hidden, even if expanded itself.
    expect(visibleRows(tree, new Set([funeral.id])).map(label)).toHaveLength(5);
  });

  test("each level comes in the order its folder's view gives, the top level in the root's", () => {
    const seen: (string | null)[] = [];
    const tree = buildTree([metal, doom, funeral, deep, later], (siblings, parentId) => {
      seen.push(parentId);
      return parentId === metal.id ? byName(siblings).toReversed() : byName(siblings);
    });
    expect(tree.roots.map((each) => each.name)).toEqual(["Later", "Metal"]);
    expect(tree.children.get(metal.id)?.map((each) => each.name)).toEqual(["Funeral", "Doom"]);
    expect(new Set(seen)).toEqual(new Set([null, metal.id, funeral.id]));
    expect(seen).toHaveLength(3);
  });

  test("ancestors run from the root down", () => {
    const tree = buildTree([metal, doom, funeral, deep, later]);
    expect(ancestorsOf(tree, deep.id).map((each) => each.name)).toEqual(["Metal", "Funeral"]);
    expect(ancestorsOf(tree, later.id)).toEqual([]);
    expect(ancestorsOf(tree, uuidv7())).toEqual([]);
  });

  test("type-ahead finds the next name starting with the typed letters, ignoring case and accents", () => {
    const tree = buildTree([folder("Doom"), list("Dub"), list("Öxabäck"), list("drone")]);
    const rows = visibleRows(tree, new Set());
    const names = (index: number | undefined) =>
      nameOf(index === undefined ? undefined : rows[index]);
    // A repeated letter cycles through the rows starting with it, wrapping around.
    expect(names(typeAhead(rows, 0, "d"))).toBe("Dub");
    expect(names(typeAhead(rows, 1, "dd"))).toBe("drone");
    expect(names(typeAhead(rows, 3, "d"))).toBe("Doom");
    // More letters stay on a row that still matches.
    expect(names(typeAhead(rows, 1, "du"))).toBe("Dub");
    expect(names(typeAhead(rows, 0, "dr"))).toBe("drone");
    expect(names(typeAhead(rows, 0, "oxa"))).toBe("Öxabäck");
    expect(names(typeAhead(rows, 0, "un"))).toBe("Unsorted");
    expect(typeAhead(rows, 0, "zz")).toBeUndefined();
  });
});

describe("Shared with me in the tree (TON-130)", () => {
  const ownerId = uuidv7();
  const entry = (
    name: string | null,
    kind: "folder" | "list" | null,
    containers: Container[] = [],
    owner = "Denis",
  ): SharedEntry => ({
    containerId: containers[0]?.parentId ?? uuidv7(),
    owner: { id: ownerId, displayName: owner },
    name,
    kind,
    via: { invitation: true, link: false },
    available: name !== null,
    containers: containers.map(({ id, kind: each, parentId, name: named }) => ({
      id,
      kind: each,
      parentId,
      name: named,
    })),
  });
  const shared = folder("Shared metal");
  const crust = folder("Crust", shared.id);
  const grind = list("Grind", crust.id);
  const black = list("Black", shared.id);
  const entries = [
    entry(null, null),
    { ...entry("Shared metal", "folder", [crust, grind, black]), containerId: shared.id },
    entry("Ambient", "list", [], "Anna"),
  ];

  test("it starts open, with what's shared by name, those that can't be opened last", () => {
    const sharedTree = buildSharedTree(entries);
    expect(sharedTree.roots.map((item) => [item.name, item.owner])).toEqual([
      ["Ambient", "Anna"],
      ["Shared metal", "Denis"],
      [null, "Denis"],
    ]);
    const rows = visibleRows(buildTree([later]), new Set(), { shared: sharedTree });
    expect(rows.map(label)).toEqual([
      "Later 1/4",
      "Unsorted 2/4",
      "Shared with me 3/4",
      "  Ambient 1/3",
      "  Shared metal 2/3",
      "  (unavailable) 3/3",
      "Trash 4/4",
    ]);
    expect(rows.find((row) => row.type === "place" && row.place === "shared")).toMatchObject({
      expanded: true,
    });
  });

  test("a shared folder opens to its folders and lists, in the order given, and Shared with me closes", () => {
    const sharedTree = buildSharedTree(entries, byName);
    expect(sharedTree.byId.get(grind.id)).toMatchObject({ rootId: shared.id, parentId: crust.id });
    const open = new Set([shared.id, crust.id]);
    expect(visibleRows(buildTree([]), open, { shared: sharedTree }).map(label)).toEqual([
      "Unsorted 1/3",
      "Shared with me 2/3",
      "  Ambient 1/3",
      "  Shared metal 2/3",
      "    Black 1/2",
      "    Crust 2/2",
      "      Grind 1/1",
      "  (unavailable) 3/3",
      "Trash 3/3",
    ]);
    open.add(sharedClosedKey);
    expect(visibleRows(buildTree([]), open, { shared: sharedTree }).map(label)).toEqual([
      "Unsorted 1/3",
      "Shared with me 2/3",
      "Trash 3/3",
    ]);
  });

  test("with nothing shared, Shared with me doesn't open", () => {
    const rows = visibleRows(buildTree([]), new Set(), { shared: buildSharedTree([]) });
    expect(rows.find((row) => row.type === "place" && row.place === "shared")).not.toHaveProperty(
      "expanded",
    );
  });
});

describe("moving folders and lists (FR-01.4, FR-01.5)", () => {
  test("a folder can't move into itself, under itself, into a list, or where it is", () => {
    const tree = buildTree([metal, doom, funeral, deep, later]);
    expect(canMoveInto(tree, metal.id, funeral.id)).toBe(false);
    expect(canMoveInto(tree, metal.id, metal.id)).toBe(false);
    expect(canMoveInto(tree, funeral.id, later.id)).toBe(false);
    expect(canMoveInto(tree, funeral.id, metal.id)).toBe(false);
    expect(canMoveInto(tree, funeral.id, null)).toBe(true);
    expect(canMoveInto(tree, later.id, funeral.id)).toBe(true);
  });

  test("the picker offers Collection and the folders that can take the item, in tree order", () => {
    const tree = buildTree([metal, doom, funeral, deep, later]);
    expect(moveDestinations(tree, later.id)).toEqual([
      { parentId: metal.id, name: "Metal", level: 1 },
      { parentId: funeral.id, name: "Funeral", level: 2 },
    ]);
    expect(moveDestinations(tree, funeral.id)).toEqual([
      { parentId: null, name: "Collection", level: 0 },
    ]);
    expect(moveDestinations(tree, deep.id)).toEqual([
      { parentId: null, name: "Collection", level: 0 },
      { parentId: metal.id, name: "Metal", level: 1 },
    ]);
  });
});
