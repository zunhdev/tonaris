// Folder and root rows (DS-41): a folder's, or the root's, folders and lists as a virtualized ARIA grid, each row
// with its icon and name, as a link, and its count: albums for a list, folders and lists for a folder. Enter opens
// it from either cell. Descriptions (M4) and sharing glyphs (M7) join later. Each row shows its save state, is busy
// while saving and highlighted when changed elsewhere (DS-80, DS-82, DS-83).

// Virtualized rows are absolutely positioned CSS grid rows, which table elements can't be without overriding their
// display, and that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { Link, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef } from "react";

import type { Container } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { ContainerIcon } from "./icons";
import { useGridFocus } from "./use-grid";

const rowHeight = 36;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ContainerRows({
  containers,
  label,
  albumCounts,
  childCounts,
}: {
  containers: readonly Container[];
  label: string;
  albumCounts: ReadonlyMap<string, number>;
  /** How many folders and lists each folder holds. */
  childCounts: (folderId: string) => number;
}) {
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
    estimateSize: () => rowHeight,
    overscan: 10,
  });
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 360) / rowHeight) - 1);
  const { onKeyDown, cellProps } = useGridFocus({
    grid,
    shape: { rows: containers.length, columns: () => 2, page },
    reveal,
    onActivate: ({ row }) => {
      const container = containers[row];
      if (!container) return;
      void (container.kind === "folder"
        ? navigate({ to: "/f/$folderId", params: { folderId: container.id } })
        : navigate({ to: "/l/$listId", params: { listId: container.id } }));
    },
  });

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto py-2">
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        aria-rowcount={containers.length + 1}
        aria-colcount={2}
        // Its cells take the focus; the grid itself only when clicked between them.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="px-4"
      >
        <div role="rowgroup" className="sr-only">
          <div role="row" aria-rowindex={1}>
            <span role="columnheader">Name</span>
            <span role="columnheader">Contents</span>
          </div>
        </div>
        <div role="rowgroup" className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const container = containers[item.index];
            if (!container) return null;
            const count =
              container.kind === "list"
                ? plural(albumCounts.get(container.id) ?? 0, "album", "albums")
                : plural(childCounts(container.id), "folder or list", "folders and lists");
            return (
              <ContainerRow
                key={container.id}
                container={container}
                count={count}
                index={item.index}
                top={item.start}
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
  count,
  index,
  top,
  cellProps,
}: {
  container: Container;
  count: string;
  index: number;
  top: number;
  cellProps: ReturnType<typeof useGridFocus>["cellProps"];
}) {
  const row = useRef<HTMLDivElement>(null);
  useLiveHighlight(container.id, row);
  const status = useSaveState(container.id);
  const name = (
    <>
      <ContainerIcon kind={container.kind} />
      <span className="truncate">{container.name}</span>
      <SaveStateMarker status={status} />
    </>
  );
  const link = cn(focusable, "flex min-w-0 items-center gap-2.5 rounded-sm pr-3 text-fg-primary");
  return (
    <div
      ref={row}
      role="row"
      aria-rowindex={index + 2}
      aria-busy={status === "pending" || status === "unconfirmed" ? true : undefined}
      className="absolute inset-x-0 grid h-9 grid-cols-[minmax(0,1fr)_12rem] items-stretch rounded-md px-2 hover:bg-hover"
      style={{ transform: `translateY(${top}px)` }}
    >
      <div role="gridcell" className="flex min-w-0">
        {container.kind === "folder" ? (
          <Link
            to="/f/$folderId"
            params={{ folderId: container.id }}
            className={link}
            {...cellProps(index, 0)}
          >
            {name}
          </Link>
        ) : (
          <Link
            to="/l/$listId"
            params={{ listId: container.id }}
            className={link}
            {...cellProps(index, 0)}
          >
            {name}
          </Link>
        )}
      </div>
      <div
        role="gridcell"
        className={cn(focusable, "flex items-center rounded-sm text-fg-tertiary")}
        {...cellProps(index, 1)}
      >
        {count}
      </div>
    </div>
  );
}
