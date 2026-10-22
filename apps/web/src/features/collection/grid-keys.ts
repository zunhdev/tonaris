// The keys of a collection view's grid (DS-115, DS-78; WAI-ARIA grid pattern): from the focused cell to the next.
// ← and → stay within the row, without wrapping; ↑ and ↓, and K and J, keep the column, clamped to a shorter row
// (the last row of cards); Home and End go to the row's ends, and with ⌘ or Ctrl to the grid's; Page Up and Page
// Down move by the rows in view. Pure, so the rules are tested without a DOM.

export type Cell = { row: number; col: number };

export type GridShape = {
  rows: number;
  /** How many cells row `row` has. */
  columns: (row: number) => number;
  /** How many rows a page holds: those in view. */
  page: number;
};

export type GridKey = Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

/** The cell `key` moves to from `from`, or undefined for a key the grid doesn't use. */
export function nextCell(key: GridKey, from: Cell, shape: GridShape): Cell | undefined {
  if (shape.rows === 0 || key.altKey) return undefined;
  const last = shape.rows - 1;
  const inRow = (row: number, col: number): Cell => ({
    row,
    col: clamp(col, shape.columns(row) - 1),
  });
  const toEnds = key.ctrlKey || key.metaKey;
  const plain = !key.ctrlKey && !key.metaKey && !key.shiftKey;
  switch (key.key) {
    case "ArrowLeft":
      return inRow(from.row, from.col - 1);
    case "ArrowRight":
      return inRow(from.row, from.col + 1);
    case "ArrowUp":
      return inRow(clamp(from.row - 1, last), from.col);
    case "ArrowDown":
      return inRow(clamp(from.row + 1, last), from.col);
    case "k":
      return plain ? inRow(clamp(from.row - 1, last), from.col) : undefined;
    case "j":
      return plain ? inRow(clamp(from.row + 1, last), from.col) : undefined;
    case "Home":
      return toEnds ? { row: 0, col: 0 } : { row: from.row, col: 0 };
    case "End":
      return toEnds
        ? inRow(last, shape.columns(last) - 1)
        : inRow(from.row, shape.columns(from.row) - 1);
    case "PageUp":
      return inRow(clamp(from.row - shape.page, last), from.col);
    case "PageDown":
      return inRow(clamp(from.row + shape.page, last), from.col);
    default:
      return undefined;
  }
}
