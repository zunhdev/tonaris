// Album rows (DS-21): a list's or Unsorted's albums as a virtualized ARIA grid of 36 px rows, each with its artwork
// tile, title, artist, year and release type, and its save state. The type collapses first as the view narrows, and
// is hidden while the view is grouped by it. Grouped, each group starts with its header, the one in view sticking
// at the top (DS-43). The checkbox and drag handle (TON-37, TON-36) and the services and Open button (M4) join these
// columns later. Each row is busy while saving and highlighted when changed elsewhere (DS-80, DS-82, DS-83).

// Virtualized rows are absolutely positioned CSS grid rows, which table elements can't be without overriding their
// display, and that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { Album } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { Artwork } from "./artwork";
import { ChronologyYear } from "./chronology-year";
import { useRowDrag } from "./drag";
import { GroupHeader, headerHeight, placement, useStickyHeader } from "./groups";
import type { ReleaseGroup, Section } from "./order";
import { useGridFocus, useWidth, type GridRearrange } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const rowHeight = 36;
/** Below this width, the type column collapses (DS-21). */
const typeFrom = 640;

const typeNames: Record<NonNullable<Album["releaseType"]>, string> = {
  album: "Album",
  ep: "EP",
  compilation: "Compilation",
};

/** The release type in words (DS-19): live first, as the groups have it (FR-05.9). */
export function typeName(album: Pick<Album, "releaseType" | "isLive">): string {
  if (album.isLive) return "Live";
  return album.releaseType === null ? "—" : typeNames[album.releaseType];
}

type Item =
  | { type: "header"; group: ReleaseGroup; count: number }
  | { type: "album"; album: Album };

/** The grid's rows: each group's header, then its albums unless collapsed; combined, just the albums. */
function itemsOf(
  sections: readonly Section<Album>[],
  collapsed: ReadonlySet<ReleaseGroup>,
): Item[] {
  return sections.flatMap(({ group, albums }) => {
    const rows = albums.map((album): Item => ({ type: "album", album }));
    if (group === undefined) return rows;
    const header: Item = { type: "header", group, count: albums.length };
    return collapsed.has(group) ? [header] : [header, ...rows];
  });
}

export function AlbumRows({
  sections,
  label,
  viewKey,
  collapsed,
  onToggle,
  moves,
}: {
  sections: readonly Section<Album>[];
  label: string;
  viewKey: string;
  collapsed: ReadonlySet<ReleaseGroup>;
  onToggle: (group: ReleaseGroup) => void;
  moves: ViewMoves;
}) {
  // The grid owns its scroll container, so that the container exists when the virtualizer first reads it.
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const width = useWidth(scroller);
  const grouped = sections[0]?.group !== undefined;
  const showType = !grouped && (width === 0 || width >= typeFrom);
  const columns = showType ? 5 : 4;
  const items = useMemo(() => itemsOf(sections, collapsed), [sections, collapsed]);
  const headers = useMemo(
    () => items.flatMap((item, index) => (item.type === "header" ? [index] : [])),
    [items],
  );
  const { rangeExtractor, isStuck } = useStickyHeader(headers);
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (items[index]?.type === "header" ? headerHeight : rowHeight),
    getItemKey: (index) => {
      const item = items[index];
      return item?.type === "header" ? `group:${item.group}` : (item?.album.id ?? index);
    },
    overscan: 10,
    rangeExtractor,
  });
  // Headers and rows differ in height, so offsets change whenever the items do.
  useEffect(() => virtualizer.measure(), [virtualizer, items]);
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 360) / rowHeight) - 1);
  const rearrange = useMemo<GridRearrange>(
    () => ({
      itemAt: ({ row }) => {
        const item = items[row];
        return item?.type === "album" ? item.album.id : undefined;
      },
      cellOf: (id, col) => {
        const row = items.findIndex((item) => item.type === "album" && item.album.id === id);
        return row === -1 ? undefined : { row, col };
      },
      move: moves.move,
    }),
    [items, moves],
  );
  const { onKeyDown, cellProps } = useGridFocus({
    grid,
    shape: {
      rows: items.length,
      columns: (row) => (items[row]?.type === "header" ? 1 : columns),
      page,
    },
    reveal,
    rearrange,
  });
  const template = showType
    ? "grid-cols-[minmax(0,3fr)_minmax(0,2fr)_7rem_6.5rem_1.5rem]"
    : "grid-cols-[minmax(0,3fr)_minmax(0,2fr)_7rem_1.5rem]";

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto py-2">
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        // Its cells take the focus; the grid itself only when clicked between them.
        tabIndex={-1}
        aria-rowcount={items.length + 1}
        aria-colcount={columns}
        onKeyDown={onKeyDown}
        className="px-4"
      >
        <div role="rowgroup" className="sr-only">
          <div role="row" aria-rowindex={1}>
            <span role="columnheader">Title</span>
            <span role="columnheader">Artist</span>
            <span role="columnheader">Year</span>
            {showType && <span role="columnheader">Type</span>}
            <span role="columnheader">Status</span>
          </div>
        </div>
        <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtual) => {
            const item = items[virtual.index];
            if (!item) return null;
            if (item.type === "header") {
              return (
                <div
                  key={`group:${item.group}`}
                  role="row"
                  aria-rowindex={virtual.index + 2}
                  className="inset-x-0 flex items-stretch bg-panel px-2"
                  style={{
                    height: headerHeight,
                    ...placement(isStuck(virtual.index), virtual.start),
                  }}
                >
                  <div role="gridcell" aria-colspan={columns} className="flex min-w-0">
                    <GroupHeader
                      group={item.group}
                      count={item.count}
                      collapsed={collapsed.has(item.group)}
                      onToggle={onToggle}
                      {...cellProps(virtual.index, 0)}
                    />
                  </div>
                </div>
              );
            }
            return (
              // Keyed by the album, not the virtualizer's cached key, which lags a reorder by a render.
              <AlbumRow
                key={item.album.id}
                album={item.album}
                viewKey={viewKey}
                manual={moves.manual}
                index={virtual.index}
                top={virtual.start}
                template={template}
                showType={showType}
                cellProps={cellProps}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const cell =
  "flex min-w-0 items-center rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus";

function AlbumRow({
  album,
  viewKey,
  manual,
  index,
  top,
  template,
  showType,
  cellProps,
}: {
  album: Album;
  viewKey: string;
  /** Under Manual sort, the row has a drag handle and takes drops (DS-21, DS-49). */
  manual: boolean;
  index: number;
  top: number;
  template: string;
  showType: boolean;
  cellProps: ReturnType<typeof useGridFocus>["cellProps"];
}) {
  const row = useRef<HTMLDivElement>(null);
  useLiveHighlight(album.id, row);
  const status = useSaveState(album.id);
  const drag = useRowDrag({ kind: "album", id: album.id, name: album.title, viewKey }, manual);
  const { ref: dragRef } = drag;
  const rowRef = useCallback(
    (element: HTMLDivElement | null) => {
      row.current = element;
      dragRef(element);
    },
    [dragRef],
  );
  const cells = [
    <div key="title" role="gridcell" className={cn(cell, "gap-2.5 pr-3")} {...cellProps(index, 0)}>
      <Artwork title={album.title} className="size-7" letterClassName="text-small" />
      <span className="truncate text-fg-primary">{album.title}</span>
    </div>,
    <div
      key="artist"
      role="gridcell"
      className={cn(cell, "pr-3 text-fg-secondary")}
      {...cellProps(index, 1)}
    >
      <span className="truncate">{album.artistCredit}</span>
    </div>,
    <div
      key="year"
      role="gridcell"
      className={cn(cell, "pr-3 text-fg-secondary")}
      {...cellProps(index, 2)}
    >
      <ChronologyYear album={album} />
    </div>,
    ...(showType
      ? [
          <div
            key="type"
            role="gridcell"
            className={cn(cell, "pr-3 text-fg-tertiary")}
            {...cellProps(index, 3)}
          >
            <span className="truncate">{typeName(album)}</span>
          </div>,
        ]
      : []),
    <div
      key="status"
      role="gridcell"
      className={cn(cell, "justify-center")}
      {...cellProps(index, showType ? 4 : 3)}
    >
      <SaveStateMarker status={status} />
    </div>,
  ];
  return (
    <div
      ref={rowRef}
      role="row"
      aria-rowindex={index + 2}
      aria-busy={status === "pending" || status === "unconfirmed" ? true : undefined}
      className={cn(
        "group/row absolute inset-x-0 top-0 grid h-9 items-stretch rounded-md px-2 hover:bg-hover",
        drag.dragging && "opacity-40",
        template,
      )}
      style={{ transform: `translateY(${top}px)` }}
    >
      {manual && <DragHandle {...drag.handle} />}
      {drag.side && <DropLine side={drag.side} />}
      {cells}
    </div>
  );
}

/**
 * A row's drag handle (DS-21), in the gutter left of the row, shown on the row's hover or focus. Pointer only and
 * hidden from assistive technology: ⌥↑ and ⌥↓ do the same from the keyboard (DS-03).
 */
export function DragHandle({
  ref,
  ...listeners
}: { ref: (element: HTMLElement | null) => void } & Record<string, unknown>) {
  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="drag-handle"
      className="absolute top-0 -left-4 flex h-9 w-4 cursor-grab touch-none items-center justify-center text-fg-tertiary opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-fg-primary"
      {...listeners}
    >
      <GripVertical strokeWidth={1.5} className="size-3.5" />
    </span>
  );
}

/** Where a dragged row would land: a line above or below this one (DS-49). */
export function DropLine({ side }: { side: "before" | "after" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-accent-solid",
        side === "before" ? "-top-px" : "-bottom-px",
      )}
    />
  );
}
