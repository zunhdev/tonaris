// What the collection views' grids share (DS-115, DS-106): the scroll container's size, and the roving focus of the
// grid pattern under virtualization. Focus is kept as a cell's position rather than an element, since rows scrolled
// out of view are unmounted; a key moving to such a row scrolls it into view first, then focuses the cell once it
// renders.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { nextCell, type Cell, type GridShape } from "./grid-keys";

/** The element's content width, kept current with a ResizeObserver. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
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

/**
 * The grid's roving focus: the cell that takes Tab, the keys that move it, and the props each cell spreads. `reveal`
 * scrolls a row into view, so that its cells render.
 */
export function useGridFocus({
  grid,
  shape,
  reveal,
  onActivate,
}: {
  grid: RefObject<HTMLElement | null>;
  shape: GridShape;
  reveal: (row: number) => void;
  /** Enter on a cell. */
  onActivate?: (cell: Cell) => void;
}) {
  const [active, setActive] = useState<Cell>({ row: 0, col: 0 });
  const pending = useRef<Cell | undefined>(undefined);
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

  const focusCell = useCallback(
    (cell: Cell) => {
      setActive(cell);
      reveal(cell.row);
      const element = grid.current?.querySelector<HTMLElement>(cellSelector(cell));
      if (element) element.focus();
      else pending.current = cell;
    },
    [grid, reveal],
  );

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented) return;
    if (event.key === "Enter" && onActivate) {
      // Activated here, so a link in the cell doesn't also follow itself.
      event.preventDefault();
      onActivate(current);
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

  return { onKeyDown, cellProps };
}
