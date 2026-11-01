// Folder and root rows (DS-41): a folder's, or the root's, folders and lists as a virtualized ARIA grid, each row
// with its icon and name, as a link, and its count: albums for a list, folders and lists for a folder. Sorted by
// creation date, a Created column shows when each was made, which its UUIDv7 ID holds (TS-10). Enter opens it from
// any cell. A description's first line follows the name; DS-41's sharing glyph isn't shown yet. Each row shows its
// save state, is busy while saving and highlighted when changed elsewhere (DS-80, DS-82, DS-83).

// Virtualized rows are absolutely positioned CSS grid rows, which table elements can't be without overriding their
// display, and that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { Link, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";

import { uuidv7Time, type Container } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { useNarrowScreen } from "../shell/media";
import { count } from "../shell/words";
import { DragHandle, DropLine } from "./album-rows";
import { useCollectionUi } from "./collection-ui";
import { useRowDrag } from "./drag";
import { ContainerIcon } from "./icons";
import { useGridFocus, type GridRearrange } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const rowHeight = 36;
/** A phone's rows (DS-110): tall enough for a 44 px touch target. */
const phoneRowHeight = 48;

const createdDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** When a folder or list was made, from its ID. */
function created(id: string): string {
  const time = uuidv7Time(id);
  return time === undefined ? "—" : createdDate.format(time);
}

export function ContainerRows({
  containers,
  label,
  albumCounts,
  childCounts,
  showCreated: createdChosen = false,
  viewKey,
  moves,
}: {
  containers: readonly Container[];
  label: string;
  albumCounts: ReadonlyMap<string, number>;
  /** How many folders and lists each folder holds. */
  childCounts: (folderId: string) => number;
  /** Whether the rows show when each was created: when sorted by creation date (DS-41). */
  showCreated?: boolean;
  viewKey: string;
  moves: ViewMoves;
}) {
  const compact = useNarrowScreen();
  const height = compact ? phoneRowHeight : rowHeight;
  // A phone has no room for the creation date.
  const showCreated = createdChosen && !compact;
  const columns = showCreated ? 3 : 2;
  // The grid owns its scroll container, so that the container exists when the virtualizer first reads it.
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: containers.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => height,
    overscan: 10,
  });
  useEffect(() => virtualizer.measure(), [virtualizer, height]);
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 360) / height) - 1);
  const rearrange = useMemo<GridRearrange>(
    () => ({
      itemAt: ({ row }) => containers[row]?.id,
      cellOf: (id, col) => {
        const row = containers.findIndex((container) => container.id === id);
        return row === -1 ? undefined : { row, col };
      },
      move: moves.move,
    }),
    [containers, moves],
  );
  const { onKeyDown, cellProps } = useGridFocus({
    grid,
    shape: { rows: containers.length, columns: () => columns, page },
    reveal,
    rearrange,
    onActivate: ({ row }) => {
      const container = containers[row];
      if (!container) return false;
      void (container.kind === "folder"
        ? navigate({ to: "/f/$folderId", params: { folderId: container.id } })
        : navigate({ to: "/l/$listId", params: { listId: container.id } }));
      return true;
    },
  });

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto py-2">
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        aria-rowcount={containers.length + 1}
        aria-colcount={columns}
        // Its cells take the focus; the grid itself only when clicked between them.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="px-4"
      >
        <div role="rowgroup" className="sr-only">
          <div role="row" aria-rowindex={1}>
            <span role="columnheader">Name</span>
            {showCreated && <span role="columnheader">Created</span>}
            <span role="columnheader">Contents</span>
          </div>
        </div>
        <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const container = containers[item.index];
            if (!container) return null;
            const contents =
              container.kind === "list"
                ? count(albumCounts.get(container.id) ?? 0, "album", "albums")
                : count(childCounts(container.id), "folder or list", "folders and lists");
            return (
              <ContainerRow
                key={container.id}
                container={container}
                contents={contents}
                created={showCreated ? created(container.id) : undefined}
                viewKey={viewKey}
                manual={moves.handles}
                index={item.index}
                top={item.start}
                height={height}
                compact={compact}
                cellProps={cellProps}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

const focusable =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus";

function ContainerRow({
  container,
  contents,
  created: createdOn,
  viewKey,
  manual,
  index,
  top,
  height,
  compact,
  cellProps,
}: {
  container: Container;
  /** What it holds, counted: "3 albums", "2 folders and lists". */
  contents: string;
  /** When it was created, if the rows show it. */
  created: string | undefined;
  viewKey: string;
  /** Under Manual sort, the row has a drag handle and takes drops (DS-21, DS-49). */
  manual: boolean;
  index: number;
  top: number;
  height: number;
  /** A phone's row: the count in a narrower column (DS-110). */
  compact: boolean;
  cellProps: ReturnType<typeof useGridFocus>["cellProps"];
}) {
  const row = useRef<HTMLDivElement>(null);
  const { setFocusedRow } = useCollectionUi();
  useLiveHighlight(container.id, row);
  const drag = useRowDrag(
    { kind: "container", id: container.id, name: container.name, viewKey },
    manual,
  );
  const { ref: dragRef } = drag;
  const rowRef = useCallback(
    (element: HTMLDivElement | null) => {
      row.current = element;
      dragRef(element);
    },
    [dragRef],
  );
  const status = useSaveState(container.id);
  const descriptionId = useId();
  const excerpt = container.description?.split("\n")[0];
  const name = (
    <>
      <ContainerIcon kind={container.kind} />
      <span className="truncate">{container.name}</span>
      <SaveStateMarker status={status} />
    </>
  );
  const link = cn(
    focusable,
    "flex min-w-0 shrink-0 items-center gap-2.5 rounded-sm pr-3 text-fg-primary",
    excerpt && "max-w-[60%]",
  );
  return (
    <div
      ref={rowRef}
      role="row"
      aria-rowindex={index + 2}
      aria-busy={status === "pending" || status === "unconfirmed" ? true : undefined}
      // M moves the folder or list whose row has focus.
      onFocus={() => setFocusedRow(container.id)}
      onBlur={() => setFocusedRow(undefined)}
      className={cn(
        "group/row absolute inset-x-0 top-0 grid items-stretch rounded-md px-2 hover:bg-hover",
        drag.dragging && "opacity-40",
        compact
          ? "grid-cols-[minmax(0,1fr)_auto]"
          : createdOn === undefined
            ? "grid-cols-[minmax(0,1fr)_12rem]"
            : "grid-cols-[minmax(0,1fr)_9rem_12rem]",
      )}
      style={{ height, transform: `translateY(${top}px)` }}
    >
      {manual && <DragHandle {...drag.handle} />}
      {drag.side && <DropLine side={drag.side} />}
      <div role="gridcell" className="flex min-w-0 items-center">
        {container.kind === "folder" ? (
          <Link
            to="/f/$folderId"
            params={{ folderId: container.id }}
            className={link}
            aria-describedby={excerpt ? descriptionId : undefined}
            {...cellProps(index, 0)}
          >
            {name}
          </Link>
        ) : (
          <Link
            to="/l/$listId"
            params={{ listId: container.id }}
            className={link}
            aria-describedby={excerpt ? descriptionId : undefined}
            {...cellProps(index, 0)}
          >
            {name}
          </Link>
        )}
        {/* The description's first line, after the name (DS-41); the link's description for assistive technology. */}
        {excerpt && (
          <span id={descriptionId} className="min-w-0 truncate pr-3 text-fg-tertiary">
            {excerpt}
          </span>
        )}
      </div>
      {createdOn !== undefined && (
        <div
          role="gridcell"
          className={cn(focusable, "flex items-center rounded-sm text-fg-secondary tabular-nums")}
          {...cellProps(index, 1)}
        >
          {createdOn}
        </div>
      )}
      <div
        role="gridcell"
        className={cn(focusable, "flex items-center rounded-sm text-fg-tertiary")}
        {...cellProps(index, createdOn === undefined ? 1 : 2)}
      >
        {contents}
      </div>
    </div>
  );
}
