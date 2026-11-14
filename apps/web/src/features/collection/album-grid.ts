// The virtualized album grid that rows (DS-21) and cards (DS-22) share (TON-150): a view's albums by group, each
// group's header on a row of its own and the one in view stuck at the top (DS-43), the virtualizer over them, and
// moving, opening (DS-46) and rearranging by keyboard (DS-49) across its cells, and selecting (TON-231): X, ⇧↑ and ⇧↓,
// and Esc. Rows put one album on a row, across all its cells; cards put an album in each cell.

import { isTextField } from "@/common/shortcuts";
import { useVirtualizer, type Range } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, type KeyboardEvent, type RefObject } from "react";

import type { Album } from "@tonaris/domain";

import { useMode } from "./collection-mode";
import { nextCell, type GridShape } from "./grid-keys";
import { headerHeight, useStickyHeader } from "./groups";
import { useAlbumOpening } from "./inspector-state";
import type { ReleaseGroup, Section } from "./order";
import { useAlbumSelection } from "./selection";
import { cellAt, useGridFocus, type GridRearrange } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

export type AlbumGridItem =
  | { type: "header"; group: ReleaseGroup; count: number }
  | { type: "albums"; albums: readonly Album[] };

/** The grid's rows: each group's header, then its albums `perRow` to a row unless collapsed; ungrouped, the rows. */
export function albumGridItems(
  sections: readonly Section<Album>[],
  collapsed: ReadonlySet<ReleaseGroup>,
  perRow: number,
): AlbumGridItem[] {
  return sections.flatMap(({ group, albums }) => {
    const rows: AlbumGridItem[] = [];
    for (let start = 0; start < albums.length; start += perRow) {
      rows.push({ type: "albums", albums: albums.slice(start, start + perRow) });
    }
    if (group === undefined) return rows;
    const header: AlbumGridItem = { type: "header", group, count: albums.length };
    return collapsed.has(group) ? [header] : [header, ...rows];
  });
}

/** The album a row holds, for rows: one album across the row. */
export const albumOf = (item: AlbumGridItem | undefined): Album | undefined =>
  item?.type === "albums" ? item.albums[0] : undefined;

export function useAlbumGrid({
  scroller,
  grid,
  sections,
  collapsed,
  layout,
  rowSize,
  page,
  overscan,
  padding = 0,
  keepAlbum,
  moves,
}: {
  /** The grid's own scroll container. */
  scroller: RefObject<HTMLDivElement | null>;
  grid: RefObject<HTMLDivElement | null>;
  sections: readonly Section<Album>[];
  collapsed: ReadonlySet<ReleaseGroup>;
  /** Rows: an album a row, across its `columns` cells. Cards: `perRow` albums a row, one a cell. */
  layout: { kind: "rows"; columns: number } | { kind: "cards"; perRow: number };
  /** An album row's height, gap included. */
  rowSize: number;
  /** The rows Page Up and Page Down move, given the scroll container's height once it has one. */
  page: (viewport: number | undefined) => number;
  overscan: number;
  /** Space before the first row and after the last. */
  padding?: number;
  /** An album whose row stays drawn while the view scrolls, such as one being edited. */
  keepAlbum?: string | undefined;
  moves: ViewMoves;
}) {
  const rows = layout.kind === "rows";
  const perRow = layout.kind === "rows" ? 1 : layout.perRow;
  const items = useMemo(
    () => albumGridItems(sections, collapsed, perRow),
    [sections, collapsed, perRow],
  );
  const headers = useMemo(
    () => items.flatMap((item, index) => (item.type === "header" ? [index] : [])),
    [items],
  );
  const { rangeExtractor, isStuck } = useStickyHeader(headers);
  const kept =
    keepAlbum === undefined
      ? -1
      : items.findIndex(
          (item) => item.type === "albums" && item.albums.some((album) => album.id === keepAlbum),
        );
  const extractRange = useCallback(
    (range: Range) => {
      const indexes = rangeExtractor(range);
      return kept === -1 || indexes.includes(kept)
        ? indexes
        : [...indexes, kept].toSorted((a, b) => a - b);
    },
    [rangeExtractor, kept],
  );
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (items[index]?.type === "header" ? headerHeight : rowSize),
    getItemKey: (index) => {
      const item = items[index];
      if (item?.type === "header") return `group:${item.group}`;
      return item?.albums[0]?.id ?? index;
    },
    overscan,
    paddingStart: padding,
    paddingEnd: padding,
    rangeExtractor: extractRange,
  });
  // Headers and rows differ in height, so offsets change whenever the items do.
  useEffect(() => virtualizer.measure(), [virtualizer, items, rowSize]);
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const rearrange = useMemo<GridRearrange>(
    () => ({
      itemAt: ({ row, col }) => {
        const item = items[row];
        return item?.type === "albums" ? item.albums[rows ? 0 : col]?.id : undefined;
      },
      cellOf: (id, col) => {
        for (const [row, item] of items.entries()) {
          if (item.type !== "albums") continue;
          const at = item.albums.findIndex((album) => album.id === id);
          if (at !== -1) return { row, col: rows ? col : at };
        }
        return undefined;
      },
      move: moves.move,
    }),
    [items, moves, rows],
  );
  const opening = useAlbumOpening(rearrange.itemAt, { doubleClickEdits: rows });
  const shape: GridShape = {
    rows: items.length,
    columns: (row) => {
      const item = items[row];
      if (item?.type !== "albums") return 1;
      return layout.kind === "rows" ? layout.columns : item.albums.length;
    },
    page: page(scroller.current?.clientHeight),
  };
  const focus = useGridFocus({
    grid,
    rearrange,
    onActivate: opening.onActivate,
    shape,
    reveal,
  });
  const selection = useAlbumSelection();
  const { editing, enterEditing } = useMode();

  /** The grid's keys, with selecting first: X, Esc while some are selected, and ⇧↑ / ⇧↓ in Editing mode. */
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const at = cellAt(event.target);
    const id = at && rearrange.itemAt(at);
    if (selection && at && !event.defaultPrevented && !isTextField(event.target)) {
      const modified = event.altKey || event.ctrlKey || event.metaKey;
      if ((event.key === "x" || event.key === "X") && !modified && !event.shiftKey) {
        if (id === undefined) return;
        event.preventDefault();
        // Selecting is for acting on the collection, so it is edit intent (DS-45).
        enterEditing();
        selection.toggle(id);
        return;
      }
      if (event.key === "Escape" && selection.ids.length > 0) {
        event.preventDefault();
        selection.clear();
        return;
      }
      if (
        editing &&
        event.shiftKey &&
        !modified &&
        (event.key === "ArrowUp" || event.key === "ArrowDown") &&
        id !== undefined
      ) {
        const next = nextCell(event, at, shape);
        const to = next && rearrange.itemAt(next);
        if (to !== undefined) selection.extend(id, to);
      }
    }
    focus.onKeyDown(event);
  }

  return { items, virtualizer, isStuck, opening, ...focus, onKeyDown };
}
