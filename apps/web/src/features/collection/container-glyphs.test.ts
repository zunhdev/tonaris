// The icon set (TON-306): every icon the domain allows has a glyph and a name, and the picker's arrow keys stay in
// its grid of six columns.

import { describe, expect, test } from "bun:test";

import { containerIcons } from "@tonaris/domain";

import { iconGlyphs, iconNames } from "./container-glyphs";
import { movedTo } from "./container-icon";

describe("folder and list icons (TON-306)", () => {
  test("every icon has its own glyph and name", () => {
    expect(Object.keys(iconGlyphs).toSorted()).toEqual([...containerIcons].toSorted());
    expect(Object.keys(iconNames).toSorted()).toEqual([...containerIcons].toSorted());
    expect(new Set(Object.values(iconGlyphs)).size).toBe(containerIcons.length);
    expect(new Set(Object.values(iconNames)).size).toBe(containerIcons.length);
  });

  test("the arrow keys move across and down the grid, and stop at its edges", () => {
    const count = containerIcons.length + 1;
    expect(movedTo("ArrowRight", 0, count)).toBe(1);
    expect(movedTo("ArrowLeft", 0, count)).toBe(0);
    expect(movedTo("ArrowDown", 1, count)).toBe(7);
    expect(movedTo("ArrowUp", 7, count)).toBe(1);
    expect(movedTo("ArrowUp", 3, count)).toBe(3);
    expect(movedTo("ArrowDown", count - 2, count)).toBe(count - 2);
    expect(movedTo("ArrowRight", count - 1, count)).toBe(count - 1);
    expect(movedTo("Home", 9, count)).toBe(0);
    expect(movedTo("End", 0, count)).toBe(count - 1);
    expect(movedTo("Enter", 4, count)).toBeUndefined();
  });
});
