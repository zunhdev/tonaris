// Album cards (DS-22): a list's or Unsorted's albums as a virtualized ARIA grid of square artwork tiles, at least
// 160 px wide in responsive columns, sized by the window rather than the inspector (TON-106), over the title, artist and year and the services the album has links for, each
// opening that service (TON-105), with the save state as a corner badge. Each
// virtual row is a row of cards; the grid states every row and column (DS-115). Grouped, each group starts with its
// header on a row of its own, the one in view sticking at the top (DS-43). A click or Enter opens a card's album in the
// inspector (DS-46).

// Virtualized rows are absolutely positioned, which table elements can't be without overriding their display, and
// that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { isUnderway } from "@/client/sync/save-states";
import { ServiceNames } from "@/features/open/service-names";
import { useShell } from "@/features/shell/shell-context";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { Album } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { Artwork, artworkSrc } from "./artwork";
import { ChronologyYear } from "./chronology-year";
import { useCollectionData } from "./data";
import { GroupHeader, headerHeight, placement, useStickyHeader } from "./groups";
import { useAlbumOpening } from "./inspector-state";
import type { ReleaseGroup, Section } from "./order";
import { useGridFocus, useWidth, type GridRearrange } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const minCard = 160;
const gap = 16;
const padding = 24;
/** The title, artist, year and services under the artwork. */
const textHeight = 88;

type Item =
  | { type: "header"; group: ReleaseGroup; count: number }
  | { type: "cards"; albums: Album[] };

/** The grid's rows: each group's header, then its albums in rows of `columns` unless collapsed. */
function itemsOf(
  sections: readonly Section<Album>[],
  collapsed: ReadonlySet<ReleaseGroup>,
  columns: number,
): Item[] {
  return sections.flatMap(({ group, albums }) => {
    const rows: Item[] = [];
    for (let start = 0; start < albums.length; start += columns) {
      rows.push({ type: "cards", albums: albums.slice(start, start + columns) });
    }
    if (group === undefined) return rows;
    const header: Item = { type: "header", group, count: albums.length };
    return collapsed.has(group) ? [header] : [header, ...rows];
  });
}

export function AlbumCards({
  sections,
  label,
  collapsed,
  onToggle,
  moves,
}: {
  sections: readonly Section<Album>[];
  label: string;
  collapsed: ReadonlySet<ReleaseGroup>;
  onToggle: (group: ReleaseGroup) => void;
  /** Cards are rearranged by keyboard; the drag handle is a row's (DS-21). */
  moves: ViewMoves;
}) {
  // The grid owns its scroll container, so that the container exists when the virtualizer first reads it.
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  // The inspector beside the view leaves fewer cards a row, not other cards: their size is worked out as if it took
  // no room, so opening and closing it keeps them as they are (TON-106).
  const { inspectorBeside, inspectorWidth } = useShell();
  const beside = inspectorBeside ? inspectorWidth : 0;
  const inner = Math.max(0, useWidth(scroller, beside) - 2 * padding);
  const whole = inner + beside;
  const wholeColumns = Math.max(1, Math.floor((whole + gap) / (minCard + gap)));
  const card = Math.min(inner, Math.floor((whole - gap * (wholeColumns - 1)) / wholeColumns));
  const columns = Math.max(1, Math.floor((inner + gap) / (card + gap)));
  const rowSize = card + textHeight + gap;
  const items = useMemo(
    () => itemsOf(sections, collapsed, columns),
    [sections, collapsed, columns],
  );
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
    estimateSize: (index) => (items[index]?.type === "header" ? headerHeight : rowSize),
    getItemKey: (index) => {
      const item = items[index];
      if (item?.type === "header") return `group:${item.group}`;
      return item?.albums[0]?.id ?? index;
    },
    overscan: 3,
    paddingStart: gap,
    paddingEnd: gap,
    rangeExtractor,
  });
  useEffect(() => virtualizer.measure(), [virtualizer, rowSize, items]);
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? rowSize) / rowSize));
  const rearrange = useMemo<GridRearrange>(
    () => ({
      itemAt: ({ row, col }) => {
        const item = items[row];
        return item?.type === "cards" ? item.albums[col]?.id : undefined;
      },
      cellOf: (id) => {
        for (const [row, item] of items.entries()) {
          if (item.type !== "cards") continue;
          const col = item.albums.findIndex((album) => album.id === id);
          if (col !== -1) return { row, col };
        }
        return undefined;
      },
      move: moves.move,
    }),
    [items, moves],
  );
  const opening = useAlbumOpening(rearrange.itemAt);
  const { onKeyDown, cellProps } = useGridFocus({
    grid,
    rearrange,
    onActivate: opening.onActivate,
    shape: {
      rows: items.length,
      columns: (row) => {
        const item = items[row];
        return item?.type === "cards" ? item.albums.length : 1;
      },
      page,
    },
    reveal,
  });

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
      {inner > 0 && (
        <div
          ref={grid}
          role="grid"
          aria-label={label}
          aria-rowcount={items.length}
          aria-colcount={columns}
          // Its cards take the focus; the grid itself only when clicked between them.
          tabIndex={-1}
          onKeyDown={onKeyDown}
          {...opening.gridProps}
          className="relative"
          style={{ height: virtualizer.getTotalSize(), marginInline: padding }}
        >
          {virtualizer.getVirtualItems().map((virtual) => {
            const item = items[virtual.index];
            if (!item) return null;
            if (item.type === "header") {
              return (
                <div
                  key={virtual.key}
                  role="row"
                  aria-rowindex={virtual.index + 1}
                  className="inset-x-0 flex items-stretch bg-panel"
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
              <div
                key={virtual.key}
                role="row"
                aria-rowindex={virtual.index + 1}
                className="absolute inset-x-0 top-0 flex"
                style={{ transform: `translateY(${virtual.start}px)`, gap }}
              >
                {item.albums.map((album, col) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    width={card}
                    col={col}
                    {...cellProps(virtual.index, col)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlbumCard({
  album,
  width,
  col,
  ...cell
}: {
  album: Album;
  width: number;
  col: number;
} & ReturnType<ReturnType<typeof useGridFocus>["cellProps"]>) {
  const ref = useRef<HTMLDivElement>(null);
  useLiveHighlight(album.id, ref);
  const status = useSaveState(album.id);
  const { linksByAlbum } = useCollectionData();
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-colindex={col + 1}
      aria-busy={isUnderway(status) || undefined}
      className="flex flex-col gap-1 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
      style={{ width, height: width + textHeight }}
      {...cell}
    >
      <span className="relative block">
        <Artwork
          title={album.title}
          src={artworkSrc(album)}
          className="w-full rounded-md"
          letterClassName="text-display"
        />
        {status && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-raised shadow-floating">
            <SaveStateMarker status={status} />
          </span>
        )}
      </span>
      <span className="mt-1 truncate font-medium text-fg-primary">{album.title}</span>
      <span className={cn("truncate text-small text-fg-secondary")}>{album.artistCredit}</span>
      <span className="flex text-small text-fg-tertiary">
        <ChronologyYear album={album} />
      </span>
      <span className="truncate text-small text-fg-tertiary">
        <ServiceNames title={album.title} links={linksByAlbum.get(album.id)} />
      </span>
    </div>
  );
}
