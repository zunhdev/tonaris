import { describe, expect, test } from "bun:test";

import type { Container } from "@tonaris/domain";

import { effectiveColor, tintedChip } from "./container-palette";

type Node = Pick<Container, "color" | "parentId">;

describe("a folder's or list's color (TON-175)", () => {
  const byId = new Map<string, Node>([
    ["rock", { color: "orange", parentId: null }],
    ["classic", { color: null, parentId: "rock" }],
    ["prog", { color: "violet", parentId: "rock" }],
  ]);

  test("its own, else the nearest folder's above it", () => {
    expect(effectiveColor({ color: "red", parentId: "classic" }, byId)).toBe("red");
    expect(effectiveColor({ color: null, parentId: "classic" }, byId)).toBe("orange");
    expect(effectiveColor({ color: null, parentId: "prog" }, byId)).toBe("violet");
    expect(effectiveColor({ color: null, parentId: null }, byId)).toBeNull();
    // A parent outside what's known, as above a share's root, gives none.
    expect(effectiveColor({ color: null, parentId: "elsewhere" }, byId)).toBeNull();
  });

  test("a chip is tinted only with a color", () => {
    expect(tintedChip(null)).toBeUndefined();
    expect(tintedChip("teal")).toContain("[--chip:var(--folder-teal)]");
  });
});
