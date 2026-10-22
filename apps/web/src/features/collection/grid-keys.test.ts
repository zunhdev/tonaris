// The keys of a collection view's grid (DS-115, DS-78).

import { describe, expect, test } from "bun:test";

import { nextCell, type GridKey, type GridShape } from "./grid-keys";

const key = (name: string, changes: Partial<GridKey> = {}): GridKey => ({
  key: name,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...changes,
});

/** Ten cards in rows of four: the last row holds two. */
const cards: GridShape = { rows: 3, columns: (row) => (row === 2 ? 2 : 4), page: 2 };
const rows: GridShape = { rows: 50, columns: () => 5, page: 10 };

describe("grid keys (DS-115)", () => {
  test("arrows move without wrapping, and keep the column clamped to a shorter row", () => {
    expect(nextCell(key("ArrowRight"), { row: 0, col: 0 }, cards)).toEqual({ row: 0, col: 1 });
    expect(nextCell(key("ArrowRight"), { row: 0, col: 3 }, cards)).toEqual({ row: 0, col: 3 });
    expect(nextCell(key("ArrowLeft"), { row: 1, col: 0 }, cards)).toEqual({ row: 1, col: 0 });
    expect(nextCell(key("ArrowDown"), { row: 1, col: 3 }, cards)).toEqual({ row: 2, col: 1 });
    expect(nextCell(key("ArrowUp"), { row: 0, col: 2 }, cards)).toEqual({ row: 0, col: 2 });
  });

  test("J and K move down and up, but not with modifiers", () => {
    expect(nextCell(key("j"), { row: 4, col: 2 }, rows)).toEqual({ row: 5, col: 2 });
    expect(nextCell(key("k"), { row: 4, col: 2 }, rows)).toEqual({ row: 3, col: 2 });
    expect(nextCell(key("j", { metaKey: true }), { row: 4, col: 2 }, rows)).toBeUndefined();
    expect(nextCell(key("ArrowDown", { altKey: true }), { row: 4, col: 2 }, rows)).toBeUndefined();
  });

  test("Home and End go to the row's ends, and with ⌘ or Ctrl to the grid's", () => {
    expect(nextCell(key("Home"), { row: 4, col: 3 }, rows)).toEqual({ row: 4, col: 0 });
    expect(nextCell(key("End"), { row: 4, col: 1 }, rows)).toEqual({ row: 4, col: 4 });
    expect(nextCell(key("Home", { ctrlKey: true }), { row: 4, col: 3 }, rows)).toEqual({
      row: 0,
      col: 0,
    });
    expect(nextCell(key("End", { metaKey: true }), { row: 0, col: 0 }, cards)).toEqual({
      row: 2,
      col: 1,
    });
  });

  test("Page Up and Page Down move by a page of rows, clamped", () => {
    expect(nextCell(key("PageDown"), { row: 4, col: 1 }, rows)).toEqual({ row: 14, col: 1 });
    expect(nextCell(key("PageDown"), { row: 45, col: 1 }, rows)).toEqual({ row: 49, col: 1 });
    expect(nextCell(key("PageUp"), { row: 4, col: 1 }, rows)).toEqual({ row: 0, col: 1 });
  });

  test("an empty grid and other keys move nowhere", () => {
    expect(nextCell(key("ArrowDown"), { row: 0, col: 0 }, { ...rows, rows: 0 })).toBeUndefined();
    expect(nextCell(key("Enter"), { row: 0, col: 0 }, rows)).toBeUndefined();
  });
});
