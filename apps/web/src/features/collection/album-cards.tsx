// Album cards (DS-22): a list's or Unsorted's albums as a virtualized ARIA grid of square artwork tiles, at least
// 160 px wide (150 on a phone, TON-281) in responsive columns, sized by the window rather than the inspector (TON-106), over the title, artist and year and the services the album has links for, each
// opening that service (TON-105), with the save state as a corner badge. Each
// virtual row is a row of cards; the grid states every row and column (DS-115). Grouped, each group starts with its
// header on a row of its own, the one in view sticking at the top (DS-43). A click or Enter opens a card's album in the
// inspector (DS-46).
//
// TON-167: the open album's card has an accent ring around its cover and its title on an accent highlight; a hovering
// pointer raises a surface behind a card, which takes no clicks, so the service links still open their service; and
// a cover names a release that isn't a plain studio album (`ReleaseLabel`).
//
// TON-280: the title takes up to two lines, and the artist two under a one-line title; cut words show whole in a
// tooltip. The year and the links that fit whole share a line, then "+N" opens the chooser for the rest. Each row is
// as tall as its fullest card, worked out from text widths (`card-text`), so short rows are a line shorter.
//
// TON-284: the year and links follow right after the artist rather than the card's bottom, where on a short card
// they sat nearer the next row's cover than their own words and read as its caption.
//
// TON-322: in Editing mode under Manual sort, a card drags itself among the cards, a line in the gap showing where it
// would land; in the person's own lists and Unsorted it drags onto their lists in the tree too, as a row's handle does.

// Virtualized rows are absolutely positioned, which table elements can't be without overriding their display, and
// that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { isUnderway } from "@/client/sync/save-states";
import { useNarrowScreen } from "@/common/media";
import { pageScroll } from "@/common/page-scroll";
import { useShell } from "@/common/shell-context";
import { useOpenIn } from "@/features/open/open-in";
import { ordered, useServiceOrder } from "@/features/open/service-choices";
import { ServiceNames } from "@/features/open/service-names";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useCallback, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import type { Album } from "@tonaris/domain";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";
import { cn } from "@tonaris/ui/lib/utils";

import { useAlbumGrid } from "./album-grid";
import { SelectBox, useToLists } from "./album-rows";
import { Artwork, artworkSrc } from "./artwork";
import {
  cardLines,
  fullCard,
  linksThatFit,
  measureText,
  useCardType,
  wordsHeight,
  yearWidth,
  type CardLines,
  type CardType,
} from "./card-text";
import { ChronologyYear } from "./chronology-year";
import { useMode } from "./collection-mode";
import { useCollectionData } from "./data";
import { useCardDrag } from "./drag";
import { GroupHeaderRow } from "./groups";
import { useInspector } from "./inspector-state";
import type { ReleaseGroup, Section } from "./order";
import { ReleaseLabel, ReleaseLabelText, releaseLabel } from "./release-label";
import { useAlbumSelection } from "./selection";
import { useLead, useWidth, type useGridFocus } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const gap = 16;

/**
 * A card's least width and the grid's padding on each side: on a phone a little less of both, so a 360 px screen
 * still fits two cards a row (TON-281). Folder cards share them (DS-41).
 */
export function cardGrid(narrow: boolean): { minCard: number; padding: number } {
  return narrow ? { minCard: 150, padding: 16 } : { minCard: 160, padding: 24 };
}

export function AlbumCards({
  sections,
  label,
  viewKey,
  collapsed,
  onToggle,
  moves,
  lead,
}: {
  sections: readonly Section<Album>[];
  label: string;
  viewKey: string;
  collapsed: ReadonlySet<ReleaseGroup>;
  onToggle: (group: ReleaseGroup) => void;
  /** Cards are rearranged by keyboard, and in Editing mode by dragging them (TON-322). */
  moves: ViewMoves;
  /** What scrolls above the cards: the list's description (TON-292). */
  lead?: ReactNode;
}) {
  // The grid owns its scroll container, so that the container exists when the virtualizer first reads it.
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [leadRef, leadHeight] = useLead();
  // The inspector beside the view leaves fewer cards a row, not other cards: their size is worked out as if it took
  // no room, so opening and closing it keeps them as they are (TON-106).
  const { inspectorBeside, inspectorWidth } = useShell();
  const { albumId } = useInspector();
  const beside = inspectorBeside ? inspectorWidth : 0;
  // A phone's screen: smaller cards and padding (TON-281), and no selecting (TON-231).
  const narrow = useNarrowScreen();
  const { minCard, padding } = cardGrid(narrow);
  const inner = Math.max(0, useWidth(scroller, beside) - 2 * padding);
  const whole = inner + beside;
  const wholeColumns = Math.max(1, Math.floor((whole + gap) / (minCard + gap)));
  const card = Math.min(inner, Math.floor((whole - gap * (wholeColumns - 1)) / wholeColumns));
  const columns = Math.max(1, Math.floor((inner + gap) / (card + gap)));
  // The words' type (DS-13), and each album's lines at this card width (TON-280).
  const type = useCardType();
  const linesById = useMemo(() => {
    const lines = new Map<string, CardLines>();
    for (const section of sections) {
      for (const album of section.albums)
        lines.set(album.id, cardLines(album, card, type, measureText));
    }
    return lines;
  }, [sections, card, type]);
  const fullRow = useCallback(
    (albums: readonly Album[]) =>
      albums.some((album) => fullCard(linesById.get(album.id) ?? { title: 2, artist: 1 })),
    [linesById],
  );
  const sizeOf = useCallback(
    (albums: readonly Album[]) => card + wordsHeight(fullRow(albums), type) + gap,
    [card, fullRow, type],
  );
  // A full row's height: Page Up and Page Down move by as many rows as fit when every one is full.
  const rowSize = card + wordsHeight(true, type) + gap;
  const selection = useAlbumSelection();
  const { editing } = useMode();
  const selecting = selection !== undefined && editing && !narrow;
  const toLists = useToLists();
  const { items, virtualizer, isStuck, opening, onKeyDown, cellProps } = useAlbumGrid({
    scroller,
    grid,
    sections,
    collapsed,
    layout: { kind: "cards", perRow: columns },
    rowSize,
    sizeOf,
    page: (viewport) => Math.max(1, Math.floor((viewport ?? rowSize) / rowSize)),
    overscan: 3,
    padding: gap,
    scrollMargin: leadHeight,
    moves,
  });

  return (
    <div ref={scroller} {...pageScroll("view")} className="min-h-0 flex-1 overflow-y-auto">
      {lead && <div ref={leadRef}>{lead}</div>}
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
                  start={virtual.start - leadHeight}
                  stuck={isStuck(virtual.index)}
                  collapsed={collapsed.has(item.group)}
                  onToggle={onToggle}
                  cellProps={cellProps}
                />
              );
            }
            const words = wordsHeight(fullRow(item.albums), type);
            return (
              <div
                key={virtual.key}
                role="row"
                aria-rowindex={virtual.index + 1}
                className="absolute inset-x-0 top-0 flex"
                style={{ transform: `translateY(${virtual.start - leadHeight}px)`, gap }}
              >
                {item.albums.map((album, col) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    viewKey={viewKey}
                    manual={moves.handles}
                    toLists={toLists}
                    width={card}
                    words={words}
                    lines={linesById.get(album.id) ?? { title: 2, artist: 1 }}
                    type={type}
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
  viewKey,
  manual,
  toLists,
  width,
  words,
  lines,
  type,
  col,
  open,
  selected,
  anySelected,
  onSelect,
  ...cell
}: {
  album: Album;
  viewKey: string;
  /** Under Manual sort in Editing mode, the card drags among the cards and takes drops (TON-322). */
  manual: boolean;
  /** Whether it drags onto the person's lists in the tree, and the list on view it is in (TON-229). */
  toLists: { listId: string | undefined } | undefined;
  width: number;
  /** The height of the words under the cover, the same for every card in its row. */
  words: number;
  lines: CardLines;
  type: CardType;
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
  const drag = useCardDrag(
    {
      kind: "album",
      id: album.id,
      name: album.title,
      viewKey,
      own: toLists !== undefined,
      listId: toLists?.listId,
    },
    manual,
    manual || toLists !== undefined,
  );
  const { ref: dragRef, setZone, dragActive } = drag;
  const cardRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      dragRef(element);
    },
    [dragRef],
  );
  const { linksByAlbum } = useCollectionData();
  const label = releaseLabel(album);
  const links = linksByAlbum.get(album.id);
  const services = ordered(links, useServiceOrder()).map((link) => link.service);
  const shown =
    services.length === 0
      ? 0
      : linksThatFit(services, yearWidth(album, true, type, measureText), width, type, measureText);
  return (
    <div
      ref={cardRef}
      role="gridcell"
      aria-colindex={col + 1}
      aria-busy={isUnderway(status) || undefined}
      aria-selected={selected}
      data-open={open || undefined}
      className={cn(
        "group/card relative isolate flex flex-col gap-1 rounded-md focus-ring outline-none",
        drag.dragging && "opacity-40",
        // Selected, the surface behind it stays, in the selected color.
        "aria-selected:before:bg-selected",
        // The raised surface under a hovering pointer, behind the card and half the gap outside it. It takes no
        // clicks, and `hover:` matches only a pointer that hovers, so a tap on a phone leaves none behind.
        "before:pointer-events-none before:absolute before:-inset-2 before:-z-10 before:rounded-lg before:transition-colors before:duration-100 before:ease-enter hover:before:bg-hover",
      )}
      style={{ width, height: width + words }}
      {...cell}
      {...drag.listeners}
    >
      {manual && <CardDropZone ref={setZone} active={dragActive} />}
      {drag.side && <CardDropLine side={drag.side} height={width} />}
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
          // Beside the checkbox, when there is one, which takes the corner (TON-234).
          <span
            className={cn(
              "absolute top-1.5 flex size-5 items-center justify-center rounded-full bg-raised shadow-floating",
              selected === undefined ? "right-1.5" : "right-9",
            )}
          >
            <SaveStateMarker status={status} />
          </span>
        )}
      </span>
      <CardWords
        slot="card-title"
        text={album.title}
        lines={lines.title}
        // The open album's title on the accent, line by line, its text in line with the other cards'. A shadow, not
        // padding pulled back by a margin, reaches 6 px past each line's ends: Safari doesn't repeat a margin on a
        // second line (TON-286). The title's own padding keeps its line clamp from cutting the shadow off.
        className={cn("mt-1 font-medium text-fg-primary", open && "-mx-1.5 px-1.5")}
      >
        {open ? (
          <span className="rounded-sm bg-accent-fill box-decoration-clone text-fg-on-accent shadow-[-6px_0_var(--accent-fill),6px_0_var(--accent-fill)]">
            {album.title}
          </span>
        ) : undefined}
      </CardWords>
      <CardWords
        slot="card-artist"
        text={album.artistCredit}
        lines={lines.artist}
        className="text-small text-fg-secondary"
      />
      {/* Right after the artist, the year, then the links that fit whole (TON-284). */}
      <span data-slot="card-foot" className="flex min-w-0 text-small text-fg-tertiary">
        <span className="shrink-0">
          <ChronologyYear album={album} />
        </span>
        <ReleaseLabelText label={label} />
        {services.length > 0 && (
          <>
            <span aria-hidden className="shrink-0 whitespace-pre">
              {" · "}
            </span>
            <span className="min-w-0 truncate">
              <ServiceNames title={album.title} links={links} limit={shown} />
              {shown < services.length && (
                <MoreLinks albumId={album.id} title={album.title} count={services.length - shown} />
              )}
            </span>
          </>
        )}
      </span>
      {/* Over the cover's corner, but last, so the card's name starts with its title. */}
      {selected !== undefined && (
        <SelectBox
          title={album.title}
          checked={selected}
          onSelect={onSelect}
          variant="card"
          className={cn(
            // The top-right corner: the top-left holds the release label (TON-234).
            "absolute top-2 right-2",
            // Only on the card's hover or focus until albums are selected (TON-232).
            !anySelected &&
              "opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100",
          )}
        />
      )}
    </div>
  );
}

/**
 * Where a card takes a dragged card: the card and half the gap around it, so a drop between two cards lands beside one
 * of them (TON-322). Behind the card, as its hover surface is, and taking the pointer only while a drag lasts, so a
 * click between cards still lands on the grid. Folder cards have it too.
 */
export function CardDropZone({
  ref,
  active,
}: {
  ref: (element: HTMLElement | null) => void;
  /** Whether anything is being dragged. */
  active: boolean;
}) {
  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="card-drop-zone"
      className={cn("absolute -inset-2 -z-10 rounded-lg", !active && "pointer-events-none")}
    />
  );
}

/**
 * Where a dragged card would land: a line in the middle of the gap left (`before`) or right of this card, as tall as
 * its cover (TON-322). Folder cards have it too.
 */
export function CardDropLine({ side, height }: { side: "before" | "after"; height: number }) {
  return (
    <span
      aria-hidden
      data-slot="drop-line"
      className={cn(
        "pointer-events-none absolute top-0 z-10 w-0.5 rounded-full bg-accent-solid",
        side === "before" ? "-left-[9px]" : "-right-[9px]",
      )}
      style={{ height }}
    />
  );
}

/** Whether an element's words run past it, so an ellipsis cuts them. */
const isCut = (element: HTMLElement | null) =>
  element !== null &&
  (element.scrollHeight > element.clientHeight + 1 ||
    element.scrollWidth > element.clientWidth + 1);

/**
 * A card's title or artist, or a folder's or list's name (TON-283), on its `lines`, ending in an ellipsis when it still
 * doesn't fit; then, under a pointer, a tooltip shows it whole (TON-280). Words that fit open no tooltip.
 */
export function CardWords({
  slot,
  text,
  lines,
  className,
  children,
}: {
  slot: string;
  text: string;
  lines: 1 | 2;
  className?: string;
  /** What shows, when it isn't plain `text`. */
  children?: ReactNode;
}) {
  // The trigger is typed as Base UI's default button; here it renders a span, which a callback ref takes as it is.
  const element = useRef<HTMLElement | null>(null);
  const setElement = useCallback((node: HTMLElement | null) => {
    element.current = node;
  }, []);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isCut(element.current))}>
      <TooltipTrigger
        ref={setElement}
        render={
          <span
            data-slot={slot}
            className={cn("break-words", lines === 1 ? "line-clamp-1" : "line-clamp-2", className)}
          />
        }
      >
        {children ?? text}
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{text}</TooltipContent>
    </Tooltip>
  );
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

/**
 * "+N" after the links that fit on a card: the "Open in…" chooser with every service the album has a link for
 * (DS-25, TON-280). Like the links it is for the pointer, as `O` is the keyboard's way, and keeps the grid's focus.
 */
function MoreLinks({ albumId, title, count }: { albumId: string; title: string; count: number }) {
  const openIn = useOpenIn();
  return (
    <button
      type="button"
      tabIndex={-1}
      data-slot="more-links"
      aria-label={`+${count} more: Open '${title}' in…`}
      onMouseDown={keepFocus}
      onClick={(event) => {
        event.stopPropagation();
        openIn?.show(albumId, event.currentTarget);
      }}
      className="rounded-sm bg-raised px-1.5 font-medium text-fg-primary outline-none hover:bg-hover"
    >
      +{count}
    </button>
  );
}
