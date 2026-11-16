// Folder and root cards (DS-41, TON-174): a folder's, or the root's, folders and lists as a virtualized ARIA grid of
// cards, at least 160 px wide (150 on a phone, TON-281) in responsive columns, as album cards are (DS-22): each a fan of its first covers
// (`coversOf`), its name and what it holds. A card is a link that opens its folder or list; the arrows walk the grid,
// Enter opens, and under Manual sort ⌥↑ and ⌥↓ rearrange (DS-49). A hovering pointer raises a surface behind a card
// (TON-167). Each card shows its save state and is highlighted when changed elsewhere (DS-80, DS-82).
//
// TON-283: a name takes two lines when it doesn't fit beside its icon, cut ones shown whole in a tooltip; the count
// goes under it with the sharing glyph, and a row is a line taller only when one of its names takes two.

// Virtualized rows are absolutely positioned, which table elements can't be without overriding their display, so the
// ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { isUnderway } from "@/client/sync/save-states";
import { useNarrowScreen } from "@/common/media";
import { pageScroll } from "@/common/page-scroll";
import { SharingGlyph } from "@/features/sharing/own-sharing";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import type { Container } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { cardGrid, CardWords } from "./album-cards";
import { artworkSrc } from "./artwork";
import { measureText, nameLines, nameWordsHeight, useCardType } from "./card-text";
import { useCollectionUi } from "./collection-ui";
import { coversOf } from "./container-covers";
import { effectiveColor } from "./container-palette";
import { CoverFan, type FanCover } from "./cover-fan";
import { useCollectionData } from "./data";
import { ContainerIcon } from "./icons";
import { ContainerLink, useOpenContainer } from "./place";
import { useGridFocus, useWidth, type GridRearrange } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const gap = 16;

const cardClass = "flex flex-col gap-1 rounded-md outline-none focus-ring";

export function ContainerCards({
  containers,
  label,
  contentsOf,
  moves,
}: {
  containers: readonly Container[];
  label: string;
  /** What it holds, counted: "3 albums", "2 folders and lists". */
  contentsOf: (container: Container) => string;
  moves: ViewMoves;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const open = useOpenContainer();
  // Sized as album cards are, a little smaller on a phone (TON-281).
  const { minCard, padding } = cardGrid(useNarrowScreen());
  const inner = Math.max(0, useWidth(scroller) - 2 * padding);
  const columns = Math.max(1, Math.floor((inner + gap) / (minCard + gap)));
  const card = Math.min(inner, Math.floor((inner - gap * (columns - 1)) / columns));
  const rowCount = Math.ceil(containers.length / columns);
  // A name takes two lines when it doesn't fit beside its icon, and its row is then a line taller (TON-283).
  const type = useCardType();
  const linesById = useMemo(
    () =>
      new Map(
        containers.map((container) => [
          container.id,
          nameLines(container.name, card, type, measureText),
        ]),
      ),
    [containers, card, type],
  );
  const rowLines = useCallback(
    (row: number): 1 | 2 =>
      containers
        .slice(row * columns, (row + 1) * columns)
        .some((container) => linesById.get(container.id) === 2)
        ? 2
        : 1,
    [containers, columns, linesById],
  );
  const sizeOf = useCallback(
    (row: number) => card + nameWordsHeight(rowLines(row), type) + gap,
    [card, rowLines, type],
  );
  // A two-line row's height: Page Up and Page Down move by as many rows as fit when every one is.
  const rowSize = card + nameWordsHeight(2, type) + gap;
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scroller.current,
    estimateSize: sizeOf,
    overscan: 3,
    paddingStart: gap,
    paddingEnd: gap,
  });
  useEffect(() => virtualizer.measure(), [virtualizer, sizeOf]);
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? rowSize) / rowSize));
  const rearrange = useMemo<GridRearrange>(
    () => ({
      itemAt: ({ row, col }) => containers[row * columns + col]?.id,
      cellOf: (id) => {
        const index = containers.findIndex((container) => container.id === id);
        return index === -1
          ? undefined
          : { row: Math.floor(index / columns), col: index % columns };
      },
      move: moves.move,
    }),
    [containers, columns, moves],
  );
  const { onKeyDown, cellProps } = useGridFocus({
    grid,
    shape: {
      rows: rowCount,
      columns: (row) => Math.max(0, Math.min(columns, containers.length - row * columns)),
      page,
    },
    reveal,
    rearrange,
    onActivate: ({ row, col }) => {
      const container = containers[row * columns + col];
      if (!container) return false;
      void open(container);
      return true;
    },
  });

  return (
    <div ref={scroller} {...pageScroll("view")} className="min-h-0 flex-1 overflow-y-auto">
      {inner > 0 && (
        <div
          ref={grid}
          role="grid"
          aria-label={label}
          aria-rowcount={rowCount}
          aria-colcount={columns}
          // Its cards take the focus; the grid itself only when clicked between them.
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="relative"
          style={{ height: virtualizer.getTotalSize(), marginInline: padding }}
        >
          {virtualizer.getVirtualItems().map((virtual) => (
            <div
              key={virtual.key}
              role="row"
              aria-rowindex={virtual.index + 1}
              className="absolute inset-x-0 top-0 flex"
              style={{ transform: `translateY(${virtual.start}px)`, gap }}
            >
              {containers
                .slice(virtual.index * columns, (virtual.index + 1) * columns)
                .map((container, col) => (
                  <ContainerCard
                    key={container.id}
                    container={container}
                    contents={contentsOf(container)}
                    width={card}
                    words={nameWordsHeight(rowLines(virtual.index), type)}
                    lines={linesById.get(container.id) ?? 2}
                    col={col}
                    {...cellProps(virtual.index, col)}
                  />
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContainerCard({
  container,
  contents,
  width,
  words,
  lines,
  col,
  ...cell
}: {
  container: Container;
  contents: string;
  width: number;
  /** The height of the words under the fan, the same for every card in its row (TON-283). */
  words: number;
  /** The name's lines. */
  lines: 1 | 2;
  col: number;
} & ReturnType<ReturnType<typeof useGridFocus>["cellProps"]>) {
  const ref = useRef<HTMLDivElement>(null);
  useLiveHighlight(container.id, ref);
  const status = useSaveState(container.id);
  const { setFocusedRow } = useCollectionUi();
  const { tree, entriesByList, albumsById, views, defaults, keys } = useCollectionData();
  const covers = useMemo<FanCover[]>(
    () =>
      coversOf(container, { tree, entriesByList, albumsById, views, defaults, keys }).map(
        (album) => ({
          id: album.id,
          title: album.title,
          src: artworkSrc(album),
        }),
      ),
    [container, tree, entriesByList, albumsById, views, defaults, keys],
  );
  const body: ReactNode = (
    <>
      <span className="relative block aspect-square w-full">
        <CoverFan covers={covers} kind={container.kind} />
        {status && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-raised shadow-floating">
            <SaveStateMarker status={status} />
          </span>
        )}
      </span>
      {/* The name on one or two lines beside its icon, level with the first (TON-283). */}
      <span className="mt-1.5 flex min-w-0 items-start gap-1.5">
        <span className="flex h-(--text-base--line-height) shrink-0 items-center">
          <ContainerIcon kind={container.kind} color={effectiveColor(container, tree.byId)} />
        </span>
        <CardWords
          slot="card-title"
          text={container.name}
          lines={lines}
          className="min-w-0 flex-1 font-medium text-fg-primary"
        />
      </span>
      {/* The count right under the name, in line with it, and the sharing glyph after it, where a cut name can't take
          it along. It follows the name rather than the card's bottom, so it never reads as the caption of the next
          row's cover (TON-283). */}
      <span
        data-slot="card-foot"
        className="flex min-w-0 items-center gap-1.5 pl-5.5 text-small text-fg-tertiary"
      >
        <span className="truncate">{contents}</span>
        <SharingGlyph containerId={container.id} />
      </span>
    </>
  );
  return (
    <div
      ref={ref}
      role="gridcell"
      aria-colindex={col + 1}
      aria-busy={isUnderway(status) || undefined}
      // M moves the folder or list whose card has focus.
      onFocus={() => setFocusedRow(container.id)}
      onBlur={() => setFocusedRow(undefined)}
      className={cn(
        "relative isolate rounded-md",
        // The raised surface under a hovering pointer, as album cards have (TON-167).
        "before:pointer-events-none before:absolute before:-inset-2 before:-z-10 before:rounded-lg before:transition-colors before:duration-100 before:ease-enter hover:before:bg-hover",
      )}
      style={{ width, height: width + words }}
    >
      <ContainerLink container={container} className={cardClass} {...cell}>
        {body}
      </ContainerLink>
    </div>
  );
}
