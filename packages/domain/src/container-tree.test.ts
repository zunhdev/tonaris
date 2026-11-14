// The in-memory walks of the folder hierarchy (TS-31): up through the folders above, nearest first, and down through
// the descendants out of Trash, each stopping at a cycle in damaged data.

import { describe, expect, test } from "bun:test";

import {
  pathOf,
  chainOf,
  moveCheck,
  moveProblem,
  treeOf,
  rootsAmong,
  subtreeDepthOf,
  subtreeOf,
} from "./container-tree";
import { maxContainerDepth } from "./limits";

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

describe("moves and deletions, as the commands decide them (FR-01.4, FR-01.5, DRIFT-021)", () => {
  const tree = treeOf([
    node("metal", null),
    node("doom", "metal"),
    node("epic", "doom"),
    node("sludge", "metal"),
    node("jazz", null),
  ]);

  test("a subtree's depth counts its levels, 1 for a leaf, 0 for none", () => {
    expect(subtreeDepthOf(tree, "metal")).toBe(3);
    expect(subtreeDepthOf(tree, "epic")).toBe(1);
    expect(subtreeDepthOf(tree, "gone")).toBe(0);
  });

  test("a move into itself or below itself is a cycle; elsewhere it passes", () => {
    expect(moveProblem(tree, "metal", "metal")).toBe("cycle");
    expect(moveProblem(tree, "metal", "doom")).toBe("cycle");
    expect(moveProblem(tree, "doom", "jazz")).toBeUndefined();
    expect(moveProblem(tree, "doom", null)).toBeUndefined();
  });

  test("a move past the nesting limit is too deep, counting the folder's own levels", () => {
    // A chain of folders exactly at the limit, and a two-level folder to put under it.
    const deep = Array.from({ length: maxContainerDepth }, (_, level) =>
      node(`level-${level}`, level === 0 ? null : `level-${level - 1}`),
    );
    const nested = treeOf([...deep, node("box", null), node("inside", "box")]);
    expect(moveProblem(nested, "box", `level-${maxContainerDepth - 2}`)).toBe("too_deep");
    expect(moveProblem(nested, "box", `level-${maxContainerDepth - 3}`)).toBeUndefined();
  });

  test("deleting several takes only the ones inside none of the others as roots", () => {
    expect(rootsAmong(tree, ["epic", "metal", "jazz", "gone"])).toEqual(["metal", "jazz"]);
  });
});

describe("pathOf and moveCheck (DRIFT-057)", () => {
  const tree = treeOf([
    { id: "metal", parentId: null },
    { id: "doom", parentId: "metal" },
    { id: "loop-a", parentId: "loop-b" },
    { id: "loop-b", parentId: "loop-a" },
  ]);

  test("a path runs from the top down, starts at the highest visible folder, and stops at a cycle", () => {
    expect(pathOf(tree, "doom").map((each) => each.id)).toEqual(["metal", "doom"]);
    expect(pathOf(tree, "doom", new Set(["doom"])).map((each) => each.id)).toEqual(["doom"]);
    expect(pathOf(tree, "loop-a").map((each) => each.id)).toEqual(["loop-b", "loop-a"]);
    expect(pathOf(tree, "missing")).toEqual([]);
  });

  test("a move into itself is a cycle, and past the depth limit too deep", () => {
    expect(moveCheck(["doom", "metal"], "metal", 1)).toBe("cycle");
    expect(
      moveCheck(
        Array.from({ length: 32 }, (_, at) => `f${at}`),
        "x",
        1,
      ),
    ).toBe("too_deep");
    expect(moveCheck(["metal"], "x", 2)).toBeUndefined();
  });
});
