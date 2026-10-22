// Album cards (DS-22): a list's or Unsorted's albums as a virtualized ARIA grid of square artwork tiles, at least
// 160 px wide in responsive columns, over the title, artist and year, with the save state as a corner badge. Each
// virtual row is a row of cards; the grid states every row and column (DS-115).

// Virtualized rows are absolutely positioned, which table elements can't be without overriding their display, and
// that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";

import type { Album } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { Artwork } from "./artwork";
import { yearLabel } from "./order";
import { useGridFocus, useWidth } from "./use-grid";

const minCard = 160;
const gap = 16;
const padding = 24;
/** The title, artist and year under the artwork. */
const textHeight = 68;

export function AlbumCards({ albums, label }: { albums: readonly Album[]; label: string }) {
  // The grid owns its scroll container, so that the container exists when the virtualizer first reads it.
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const inner = Math.max(0, useWidth(scroller) - 2 * padding);
  const columns = Math.max(1, Math.floor((inner + gap) / (minCard + gap)));
  const card = Math.floor((inner - gap * (columns - 1)) / columns);
  const rows = Math.ceil(albums.length / columns);
  const rowSize = card + textHeight + gap;
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowSize,
    overscan: 3,
    paddingStart: gap,
    paddingEnd: gap,
  });
  useEffect(() => virtualizer.measure(), [virtualizer, rowSize]);
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const lastRow = albums.length - columns * (rows - 1);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? rowSize) / rowSize));
  const { onKeyDown, cellProps } = useGridFocus({
    grid,
    shape: { rows, columns: (row) => (row === rows - 1 ? lastRow : columns), page },
    reveal,
  });

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
      {inner > 0 && (
        <div
          ref={grid}
          role="grid"
          aria-label={label}
          aria-rowcount={rows}
          aria-colcount={columns}
          // Its cards take the focus; the grid itself only when clicked between them.
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="relative"
          style={{ height: virtualizer.getTotalSize(), marginInline: padding }}
        >
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              role="row"
              aria-rowindex={item.index + 1}
              className="absolute inset-x-0 flex"
              style={{ transform: `translateY(${item.start}px)`, gap }}
            >
              {albums.slice(item.index * columns, (item.index + 1) * columns).map((album, col) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  width={card}
                  col={col}
                  {...cellProps(item.index, col)}
                />
              ))}
            </div>
          ))}
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
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-colindex={col + 1}
      aria-busy={status === "pending" || status === "unconfirmed" ? true : undefined}
      className="flex flex-col gap-1 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid"
      style={{ width, height: width + textHeight }}
      {...cell}
    >
      <span className="relative block">
        <Artwork title={album.title} className="w-full rounded-md" letterClassName="text-display" />
        {status && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-raised shadow-floating">
            <SaveStateMarker status={status} />
          </span>
        )}
      </span>
      <span className="mt-1 truncate font-medium text-fg-primary">{album.title}</span>
      <span className={cn("truncate text-small text-fg-secondary")}>{album.artistCredit}</span>
      <span className="text-small text-fg-tertiary tabular-nums">{yearLabel(album)}</span>
    </div>
  );
}
