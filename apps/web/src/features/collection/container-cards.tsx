// Folder and root cards (DS-41, TON-174): a folder's, or the root's, folders and lists as a virtualized ARIA grid of
// cards, at least 160 px wide in responsive columns, as album cards are (DS-22): each a fan of its first covers
// (`coversOf`), its name and what it holds. A card is a link that opens its folder or list; the arrows walk the grid,
// Enter opens, and under Manual sort ⌥↑ and ⌥↓ rearrange (DS-49). A hovering pointer raises a surface behind a card
// (TON-167). Each card shows its save state and is highlighted when changed elsewhere (DS-80, DS-82).

// Virtualized rows are absolutely positioned, which table elements can't be without overriding their display, so the
// ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { isUnderway } from "@/client/sync/save-states";
import { pageScroll } from "@/common/page-scroll";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { Link, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import type { Container } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { artworkSrc } from "./artwork";
import { useCollectionUi } from "./collection-ui";
import { coversOf } from "./container-covers";
import { effectiveColor } from "./container-palette";
import { CoverFan, type FanCover } from "./cover-fan";
import { useCollectionData } from "./data";
import { ContainerIcon } from "./icons";
import { useGridFocus, useWidth, type GridRearrange } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const minCard = 160;
const gap = 16;
const padding = 24;
/** The name and the count under the fan. */
const textHeight = 52;

const cardClass =
  "flex flex-col gap-1 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid";

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
  const navigate = useNavigate();
  const inner = Math.max(0, useWidth(scroller) - 2 * padding);
  const columns = Math.max(1, Math.floor((inner + gap) / (minCard + gap)));
  const card = Math.min(inner, Math.floor((inner - gap * (columns - 1)) / columns));
  const rowCount = Math.ceil(containers.length / columns);
  const rowSize = card + textHeight + gap;
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowSize,
    overscan: 3,
    paddingStart: gap,
    paddingEnd: gap,
  });
  useEffect(() => virtualizer.measure(), [virtualizer, rowSize]);
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
      void (container.kind === "folder"
        ? navigate({ to: "/f/$folderId", params: { folderId: container.id } })
        : navigate({ to: "/l/$listId", params: { listId: container.id } }));
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
  col,
  ...cell
}: {
  container: Container;
  contents: string;
  width: number;
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
      <span className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <ContainerIcon kind={container.kind} color={effectiveColor(container, tree.byId)} />
        <span className="truncate font-medium text-fg-primary">{container.name}</span>
      </span>
      <span className="truncate text-small text-fg-tertiary">{contents}</span>
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
      style={{ width, height: width + textHeight }}
    >
      {container.kind === "folder" ? (
        <Link to="/f/$folderId" params={{ folderId: container.id }} className={cardClass} {...cell}>
          {body}
        </Link>
      ) : (
        <Link to="/l/$listId" params={{ listId: container.id }} className={cardClass} {...cell}>
          {body}
        </Link>
      )}
    </div>
  );
}
