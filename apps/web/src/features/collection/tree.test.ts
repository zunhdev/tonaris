// The sidebar tree's model (DS-27, DS-31, FR-01.3).

import { describe, expect, test } from "bun:test";

import { uuidv7, type Container } from "@tonaris/domain";

import {
  ancestorsOf,
  buildTree,
  canMoveInto,
  moveDestinations,
  typeAhead,
  visibleRows,
  type TreeRow,
} from "./tree";

const folder = (name: string, parentId: string | null = null): Container => ({
  id: uuidv7(),
  kind: "folder",
  parentId,
  name,
});
const list = (name: string, parentId: string | null = null): Container => ({
  ...folder(name, parentId),
  kind: "list",
});

const label = (row: TreeRow) =>
  `${"  ".repeat(row.level - 1)}${row.type === "container" ? row.container.name : row.name} ${row.posInSet}/${row.setSize}`;

// Made in this order, so their IDs sort this way.
const metal = folder("Metal");
const doom = list("Doom", metal.id);
const funeral = folder("Funeral", metal.id);
const deep = list("Deep", funeral.id);
const later = list("Later");

const byName = (siblings: Container[]) =>
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
    const names = (index: number | undefined) => {
      const row = index === undefined ? undefined : rows[index];
      return row?.type === "container" ? row.container.name : row?.name;
    };
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
