// Album cards (DS-22): a list's or Unsorted's albums as a virtualized ARIA grid of square artwork tiles, at least
// 160 px wide in responsive columns, sized by the window rather than the inspector (TON-106), over the title, artist and year and the services the album has links for, each
// opening that service (TON-105), with the save state as a corner badge. Each
// virtual row is a row of cards; the grid states every row and column (DS-115). Grouped, each group starts with its
// header on a row of its own, the one in view sticking at the top (DS-43). A click or Enter opens a card's album in the
// inspector (DS-46).
//
// TON-167: the open album's card has an accent ring around its cover and its title on an accent highlight; a hovering
// pointer raises a surface behind a card, which takes no clicks, so the service links still open their service; and
// a cover names a release that isn't a plain studio album (`ReleaseLabel`).

// Virtualized rows are absolutely positioned, which table elements can't be without overriding their display, and
// that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { isUnderway } from "@/client/sync/save-states";
import { useNarrowScreen } from "@/common/media";
import { pageScroll } from "@/common/page-scroll";
import { useShell } from "@/common/shell-context";
import { ServiceNames } from "@/features/open/service-names";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useRef } from "react";

import type { Album } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { useAlbumGrid } from "./album-grid";
import { SelectBox } from "./album-rows";
import { Artwork, artworkSrc } from "./artwork";
import { ChronologyYear } from "./chronology-year";
import { useMode } from "./collection-mode";
import { useCollectionData } from "./data";
import { GroupHeaderRow } from "./groups";
import { useInspector } from "./inspector-state";
import type { ReleaseGroup, Section } from "./order";
import { ReleaseLabel, ReleaseLabelText, releaseLabel } from "./release-label";
import { useAlbumSelection } from "./selection";
import { useWidth, type useGridFocus } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const minCard = 160;
const gap = 16;
const padding = 24;
/** The title, artist, year and services under the artwork. */
const textHeight = 88;

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
  const { albumId } = useInspector();
  const beside = inspectorBeside ? inspectorWidth : 0;
  const inner = Math.max(0, useWidth(scroller, beside) - 2 * padding);
  const whole = inner + beside;
  const wholeColumns = Math.max(1, Math.floor((whole + gap) / (minCard + gap)));
  const card = Math.min(inner, Math.floor((whole - gap * (wholeColumns - 1)) / wholeColumns));
  const columns = Math.max(1, Math.floor((inner + gap) / (card + gap)));
  const rowSize = card + textHeight + gap;
  // In Editing mode on a computer, albums can be selected (TON-231).
  const narrow = useNarrowScreen();
  const selection = useAlbumSelection();
  const { editing } = useMode();
  const selecting = selection !== undefined && editing && !narrow;
  const { items, virtualizer, isStuck, opening, onKeyDown, cellProps } = useAlbumGrid({
    scroller,
    grid,
    sections,
    collapsed,
    layout: { kind: "cards", perRow: columns },
    rowSize,
    page: (viewport) => Math.max(1, Math.floor((viewport ?? rowSize) / rowSize)),
    overscan: 3,
    padding: gap,
    moves,
  });

  return (
    <div ref={scroller} {...pageScroll("view")} className="min-h-0 flex-1 overflow-y-auto">
      {inner > 0 && (
        <div
          ref={grid}
          role="grid"
          aria-label={label}
          aria-rowcount={items.length}
          aria-colcount={columns}
          aria-multiselectable={selecting || undefined}
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
                <GroupHeaderRow
                  key={virtual.key}
                  group={item.group}
                  count={item.count}
                  index={virtual.index}
                  rowIndex={virtual.index + 1}
                  columns={columns}
                  start={virtual.start}
                  stuck={isStuck(virtual.index)}
                  collapsed={collapsed.has(item.group)}
                  onToggle={onToggle}
                  cellProps={cellProps}
                />
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
                    open={album.id === albumId}
                    selected={selecting ? selection.has(album.id) : undefined}
                    anySelected={selecting && selection.ids.length > 0}
                    onSelect={(extend) => {
                      if (!selection) return;
                      const anchor = selection.ids.at(-1);
                      if (extend && anchor !== undefined) selection.extend(anchor, album.id);
                      else selection.toggle(album.id);
                    }}
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
  open,
  selected,
  anySelected,
  onSelect,
  ...cell
}: {
  album: Album;
  width: number;
  col: number;
  /** Whether the inspector shows this album. */
  open: boolean;
  /** Whether it is selected, while albums can be selected (TON-231). */
  selected: boolean | undefined;
  /** Whether any album is selected, which shows every checkbox (TON-232). */
  anySelected: boolean;
  onSelect: (extend: boolean) => void;
} & ReturnType<ReturnType<typeof useGridFocus>["cellProps"]>) {
  const ref = useRef<HTMLDivElement>(null);
  useLiveHighlight(album.id, ref);
  const status = useSaveState(album.id);
  const { linksByAlbum } = useCollectionData();
  const label = releaseLabel(album);
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-colindex={col + 1}
      aria-busy={isUnderway(status) || undefined}
      aria-selected={selected}
      data-open={open || undefined}
      className={cn(
        "group/card relative isolate flex flex-col gap-1 rounded-md focus-ring outline-none",
        // Selected, the surface behind it stays, in the selected color.
        "aria-selected:before:bg-selected",
        // The raised surface under a hovering pointer, behind the card and half the gap outside it. It takes no
        // clicks, and `hover:` matches only a pointer that hovers, so a tap on a phone leaves none behind.
        "before:pointer-events-none before:absolute before:-inset-2 before:-z-10 before:rounded-lg before:transition-colors before:duration-100 before:ease-enter hover:before:bg-hover",
      )}
      style={{ width, height: width + textHeight }}
      {...cell}
    >
      <span className="relative block">
        <Artwork
          title={album.title}
          src={artworkSrc(album)}
          raised
          className={cn(
            "w-full rounded-md",
            open && "outline-2 outline-offset-3 outline-accent-solid outline-solid",
          )}
          letterClassName="text-display"
        />
        <ReleaseLabel label={label} />
        {status && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-raised shadow-floating">
            <SaveStateMarker status={status} />
          </span>
        )}
      </span>
      <span
        className={cn(
          "mt-1 truncate font-medium text-fg-primary",
          // The open album's title on the accent, padded out and pulled back so its text stays in line.
          open &&
            "-mx-1.5 max-w-[calc(100%+0.75rem)] self-start rounded-sm bg-accent-fill px-1.5 text-fg-on-accent",
        )}
      >
        {album.title}
      </span>
      <span className={cn("truncate text-small text-fg-secondary")}>{album.artistCredit}</span>
      <span className="flex text-small text-fg-tertiary">
        <ChronologyYear album={album} />
        <ReleaseLabelText label={label} />
      </span>
      <span className="truncate text-small text-fg-tertiary">
        <ServiceNames title={album.title} links={linksByAlbum.get(album.id)} />
      </span>
      {/* Over the cover's corner, but last, so the card's name starts with its title. */}
      {selected !== undefined && (
        <SelectBox
          title={album.title}
          checked={selected}
          onSelect={onSelect}
          variant="card"
          className={cn(
            "absolute top-2 left-2",
            // Only on the card's hover or focus until albums are selected (TON-232).
            !anySelected &&
              "opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100",
          )}
        />
      )}
    </div>
  );
}
