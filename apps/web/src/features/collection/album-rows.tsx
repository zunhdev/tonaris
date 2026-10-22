// Album rows (DS-21): a list's or Unsorted's albums as a virtualized ARIA grid of 36 px rows, each with its artwork
// tile, title, artist, year and release type, and its save state. The type collapses first as the view narrows.
// The checkbox and drag handle (TON-37, TON-36) and the services and Open button (M4) join these columns later.
// Each row is busy while saving and highlighted when changed elsewhere (DS-80, DS-82, DS-83).

// Virtualized rows are absolutely positioned CSS grid rows, which table elements can't be without overriding their
// display, and that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef } from "react";

import type { Album } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { Artwork } from "./artwork";
import { yearLabel } from "./order";
import { useGridFocus, useWidth } from "./use-grid";

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

export function AlbumRows({ albums, label }: { albums: readonly Album[]; label: string }) {
  // The grid owns its scroll container, so that the container exists when the virtualizer first reads it.
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const width = useWidth(scroller);
  const showType = width === 0 || width >= typeFrom;
  const columns = showType ? 5 : 4;
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: albums.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 360) / rowHeight) - 1);
  const { onKeyDown, cellProps } = useGridFocus({
    grid,
    shape: { rows: albums.length, columns: () => columns, page },
    reveal,
  });
  const template = showType
    ? "grid-cols-[minmax(0,3fr)_minmax(0,2fr)_4.5rem_6.5rem_1.5rem]"
    : "grid-cols-[minmax(0,3fr)_minmax(0,2fr)_4.5rem_1.5rem]";

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto py-2">
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        // Its cells take the focus; the grid itself only when clicked between them.
        tabIndex={-1}
        aria-rowcount={albums.length + 1}
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
          {virtualizer.getVirtualItems().map((item) => {
            const album = albums[item.index];
            if (!album) return null;
            return (
              <AlbumRow
                key={album.id}
                album={album}
                index={item.index}
                top={item.start}
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
  index,
  top,
  template,
  showType,
  cellProps,
}: {
  album: Album;
  index: number;
  top: number;
  template: string;
  showType: boolean;
  cellProps: ReturnType<typeof useGridFocus>["cellProps"];
}) {
  const row = useRef<HTMLDivElement>(null);
  useLiveHighlight(album.id, row);
  const status = useSaveState(album.id);
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
      className={cn(cell, "pr-3 text-fg-secondary tabular-nums")}
      {...cellProps(index, 2)}
    >
      {yearLabel(album)}
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
      ref={row}
      role="row"
      aria-rowindex={index + 2}
      aria-busy={status === "pending" || status === "unconfirmed" ? true : undefined}
      className={cn(
        "absolute inset-x-0 grid h-9 items-stretch rounded-md px-2 hover:bg-hover",
        template,
      )}
      style={{ transform: `translateY(${top}px)` }}
    >
      {cells}
    </div>
  );
}
