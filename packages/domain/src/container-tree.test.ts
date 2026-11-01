// The in-memory walks of the folder hierarchy (TS-31): up through the folders above, nearest first, and down through
// the descendants out of Trash, each stopping at a cycle in damaged data.

import { describe, expect, test } from "bun:test";

import { chainOf, subtreeOf, treeOf } from "./container-tree";

const node = (id: string, parentId: string | null, trashed = false) => ({ id, parentId, trashed });

describe("container walks (TS-31)", () => {
  const tree = treeOf([
    node("metal", null),
    node("doom", "metal"),
    node("epic", "doom"),
    node("sludge", "metal"),
    node("old", "metal", true),
    node("inside-old", "old"),
  ]);

  test("up: the parent and the folders above it, nearest first; none for the root", () => {
    expect(chainOf(tree, "doom")).toEqual(["doom", "metal"]);
    expect(chainOf(tree, null)).toEqual([]);
    // A parent outside the tree ends the walk after it.
    expect(chainOf(tree, "gone")).toEqual(["gone"]);
  });

  test("down: the container and its descendants out of Trash, breadth-first", () => {
    expect(subtreeOf(tree, "metal")).toEqual(["metal", "doom", "sludge", "epic"]);
    expect(subtreeOf(tree, "epic")).toEqual(["epic"]);
  });

  test("a cycle in damaged data ends both walks", () => {
    const loop = treeOf([node("a", "b"), node("b", "a")]);
    expect(chainOf(loop, "a")).toEqual(["a", "b"]);
    expect(subtreeOf(loop, "a")).toEqual(["a", "b"]);
  });
});
