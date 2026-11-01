// What the collection views' grids share (DS-115, DS-106): the scroll container's size, and the roving focus of the
// grid pattern under virtualization. Focus is kept as a cell's position rather than an element, since rows scrolled
// out of view are unmounted; a key moving to such a row scrolls it into view first, then focuses the cell once it
// renders. ⌥↑ and ⌥↓, with ⇧ for the ends, rearrange the focused item (DS-49), and focus follows it to its new cell.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { isTextField } from "../shell/shortcuts";
import { directionOf, nextCell, type Cell, type GridShape } from "./grid-keys";
import type { Direction } from "./order";

/** How a grid rearranges its items by keyboard: the item at a cell, an item's cell, and the move itself. */
export type GridRearrange = {
  itemAt: (cell: Cell) => string | undefined;
  /** The item's cell now, keeping `col` where the grid's rows are alike; undefined if it isn't shown. */
  cellOf: (id: string, col: number) => Cell | undefined;
  /** Moves the item; answers whether anything moved. */
  move: (id: string, to: Direction) => boolean;
};

/**
 * The element's content width, kept current with a ResizeObserver. A change of `remeasure` measures it again before
 * the next paint, for a layout change the observer would report a frame late.
 */
export function useWidth(ref: RefObject<HTMLElement | null>, remeasure?: unknown): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(
    () => {
      if (ref.current) setWidth(ref.current.clientWidth);
    },
    // `remeasure` isn't read: its change is the reason to measure.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    [ref, remeasure],
  );
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const cellSelector = (cell: Cell) => `[data-cell="${cell.row}:${cell.col}"]`;

/** The cell `target` is in, from its `data-cell` address. */
export function cellAt(target: EventTarget): Cell | undefined {
  const address =
    target instanceof Element ? target.closest("[data-cell]")?.getAttribute("data-cell") : null;
  const [row, col] = (address ?? "").split(":").map(Number);
  return row === undefined || col === undefined || Number.isNaN(row) || Number.isNaN(col)
    ? undefined
    : { row, col };
}

/**
 * The grid's roving focus: the cell that takes Tab, the keys that move it, and the props each cell spreads. `reveal`
 * scrolls a row into view, so that its cells render.
 */
export function useGridFocus({
  grid,
  shape,
  reveal,
  onActivate,
  rearrange,
}: {
  grid: RefObject<HTMLElement | null>;
  shape: GridShape;
  reveal: (row: number) => void;
  /** Enter on a cell; answers whether it acted, which then claims the key. */
  onActivate?: (cell: Cell) => boolean;
  /** ⌥↑ and ⌥↓ on a cell, when the grid's items can be rearranged. */
  rearrange?: GridRearrange;
}) {
  const [active, setActive] = useState<Cell>({ row: 0, col: 0 });
  const pending = useRef<Cell | undefined>(undefined);
  /** An item just moved by keyboard, whose cell takes the focus once it is drawn somewhere else. */
  const following = useRef<{ id: string; from: Cell } | undefined>(undefined);
  // The rows may have shrunk since the cell was focused.
  const row = Math.min(active.row, Math.max(0, shape.rows - 1));
  const current: Cell = { row, col: Math.min(active.col, Math.max(0, shape.columns(row) - 1)) };

  useEffect(() => {
    const cell = pending.current;
    const element = cell && grid.current?.querySelector<HTMLElement>(cellSelector(cell));
    if (!element) return;
    pending.current = undefined;
    element.focus();
  });

  function focusCell(cell: Cell) {
    setActive(cell);
    reveal(cell.row);
    const element = grid.current?.querySelector<HTMLElement>(cellSelector(cell));
    if (element) element.focus();
    else pending.current = cell;
  }

  // The moved item is drawn at its new place a render or two later, once its key is in the collection. Before the
  // browser paints, so the next key press finds the focus where the item is.
  useLayoutEffect(() => {
    const moved = following.current;
    if (!moved || !rearrange) return;
    const cell = rearrange.cellOf(moved.id, moved.from.col);
    if (!cell) {
      following.current = undefined;
      return;
    }
    if (cell.row === moved.from.row && cell.col === moved.from.col) return;
    following.current = undefined;
    focusCell(cell);
  });

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Keys typed into a cell's editor are the editor's: letters, arrows, Home and End.
    if (event.defaultPrevented || isTextField(event.target)) return;
    const to = rearrange && directionOf(event);
    if (rearrange && to) {
      event.preventDefault();
      // The focused cell's own address: after a move it is drawn at its new row before the roving focus catches up.
      const from = cellAt(event.target) ?? current;
      const id = rearrange.itemAt(from);
      if (id !== undefined && rearrange.move(id, to)) following.current = { id, from };
      return;
    }
    // Activated here, so a link in the cell doesn't also follow itself.
    if (event.key === "Enter" && onActivate?.(cellAt(event.target) ?? current)) {
      event.preventDefault();
      return;
    }
    const next = nextCell(event, current, shape);
    if (!next) return;
    event.preventDefault();
    focusCell(next);
  }

  /** The props of the cell at `row`, `col`: its address, its place in the tab order, and taking the focus. */
  function cellProps(cellRow: number, col: number) {
    return {
      "data-cell": `${cellRow}:${col}`,
      tabIndex: cellRow === current.row && col === current.col ? 0 : -1,
      onFocus: () => {
        if (cellRow !== active.row || col !== active.col) setActive({ row: cellRow, col });
      },
    };
  }

  return { onKeyDown, cellProps, focusCell };
}
