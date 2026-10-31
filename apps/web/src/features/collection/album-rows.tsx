// Album rows (DS-21): a list's or Unsorted's albums as a virtualized ARIA grid of 36 px rows, each with its artwork
// tile, title, artist, year and release type, and its save state. The type collapses first as the view narrows, and
// is hidden while the view is grouped by it. Grouped, each group starts with its header, the one in view sticking
// at the top (DS-43). A click, or Enter in Viewing mode, opens the album in the inspector (DS-46). In Editing mode,
// the title, artist and year cells edit inline (DS-45): Enter or a double-click opens one, and F2 the title,
// switching to Editing first. The services the album has links for follow the type, each opening that service
// (TON-105), and collapse first; the status
// cell has the Open button on hover or focus, which opens the "Open in…" chooser (DS-21, DS-25). The checkbox joins
// these columns later. Each row is busy while saving and highlighted when changed elsewhere (DS-80, DS-82, DS-83).

// Virtualized rows are absolutely positioned CSS grid rows, which table elements can't be without overriding their
// display, and that drops their table semantics in some browsers; so the ARIA grid roles go on plain elements.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { useOpenIn } from "@/features/open/open-in";
import { ServiceNames } from "@/features/open/service-names";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useVirtualizer, type Range } from "@tanstack/react-virtual";
import { ExternalLink, GripVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type { Album, ServiceLink } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { isTextField } from "../shell/shortcuts";
import { albumEdit, cellText, type AlbumCell } from "./album-edit";
import { Artwork, artworkSrc } from "./artwork";
import { ChronologyYear } from "./chronology-year";
import { useCollectionUi, useMode, useNarrowScreen } from "./collection-ui";
import { useCollectionData } from "./data";
import { useRowDrag } from "./drag";
import { GroupHeader, headerHeight, placement, useStickyHeader } from "./groups";
import { useAlbumOpening } from "./inspector-state";
import type { ReleaseGroup, Section } from "./order";
import { cellAt, useGridFocus, useWidth, type GridRearrange } from "./use-grid";
import type { ViewMoves } from "./use-rearrange";

const rowHeight = 36;
/** A phone's rows (DS-110): 56 px, with 44 px artwork and the artist under the title. */
const phoneRowHeight = 56;

/** The cells that edit inline, by column: title, artist and year (DS-45). */
const editableCells: readonly AlbumCell[] = ["title", "artistCredit", "year"];

/** Each editor's name, for its accessible label: "Title of 'Nightfall'". */
export const cellNames: Record<AlbumCell, string> = {
  title: "Title",
  artistCredit: "Artist",
  year: "Year",
  originalYear: "Original release year",
  recording: "Recording year or range",
};

/** The cell being edited inline: its album, its value as typed, and why that was refused, if it was. */
type CellEdit = { albumId: string; cell: AlbumCell; draft: string; refusal?: string };
/** Below this width, the type column collapses (DS-21). */
const typeFrom = 640;
/** Below this width, the services column collapses, before the type (DS-21). */
const servicesFrom = 760;

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
  const compact = useNarrowScreen();
  const height = compact ? phoneRowHeight : rowHeight;
  const grouped = sections[0]?.group !== undefined;
  const showType = !compact && !grouped && (width === 0 || width >= typeFrom);
  const showServices = !compact && (width === 0 || width >= servicesFrom);
  // A phone's title cell holds the artist too.
  const columns = (compact ? 3 : 4) + (showType ? 1 : 0) + (showServices ? 1 : 0);
  const { linksByAlbum } = useCollectionData();
  const items = useMemo(() => itemsOf(sections, collapsed), [sections, collapsed]);
  const headers = useMemo(
    () => items.flatMap((item, index) => (item.type === "header" ? [index] : [])),
    [items],
  );
  const { rangeExtractor, isStuck } = useStickyHeader(headers);
  const client = useSyncClient();
  const offline = useConnection() === "offline";
  const { editing, enterEditing } = useMode();
  const { registerEditor } = useCollectionUi();
  // The edit lives here, not in the row, so that scrolling can't lose it; the ref is what the handlers read.
  const [cellEdit, setCellEditState] = useState<CellEdit | undefined>(undefined);
  const current = useRef<CellEdit | undefined>(undefined);
  const setCellEdit = useCallback((next: CellEdit | undefined) => {
    current.current = next;
    setCellEditState(next);
  }, []);
  const editRow =
    cellEdit === undefined
      ? -1
      : items.findIndex((item) => item.type === "album" && item.album.id === cellEdit.albumId);
  // The edited row stays drawn while the view scrolls.
  const extractRange = useCallback(
    (range: Range) => {
      const indexes = rangeExtractor(range);
      return editRow === -1 || indexes.includes(editRow)
        ? indexes
        : [...indexes, editRow].toSorted((a, b) => a - b);
    },
    [rangeExtractor, editRow],
  );
  // TanStack Virtual re-renders on scroll by design; the app isn't compiled with React Compiler, which the rule is
  // about.
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (items[index]?.type === "header" ? headerHeight : height),
    getItemKey: (index) => {
      const item = items[index];
      return item?.type === "header" ? `group:${item.group}` : (item?.album.id ?? index);
    },
    overscan: 10,
    rangeExtractor: extractRange,
  });
  // Headers and rows differ in height, so offsets change whenever the items do.
  useEffect(() => virtualizer.measure(), [virtualizer, items, height]);
  const reveal = useCallback((row: number) => virtualizer.scrollToIndex(row), [virtualizer]);
  const page = Math.max(1, Math.floor((scroller.current?.clientHeight ?? 360) / height) - 1);
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
  const opening = useAlbumOpening(rearrange.itemAt);
  const { onKeyDown, cellProps, focusCell } = useGridFocus({
    grid,
    shape: {
      rows: items.length,
      columns: (row) => (items[row]?.type === "header" ? 1 : columns),
      page,
    },
    reveal,
    onActivate: opening.onActivate,
    rearrange,
  });

  const albumAt = (id: string) => {
    const item = items.find((each) => each.type === "album" && each.album.id === id);
    return item?.type === "album" ? item.album : undefined;
  };

  /** Opens a cell's editor; edits wait while offline (DS-81). */
  function startEdit(album: Album, cell: AlbumCell) {
    if (offline || !client) return;
    setCellEdit({ albumId: album.id, cell, draft: cellText(album, cell) });
  }

  /** Closes the editor and gives its cell the focus back. */
  function closeEdit(edit: CellEdit) {
    setCellEdit(undefined);
    const row = items.findIndex((item) => item.type === "album" && item.album.id === edit.albumId);
    if (row !== -1) focusCell({ row, col: editableCells.indexOf(edit.cell) });
  }

  /** Saves the edit, or shows why it can't be saved; whether the editor closed. */
  function commitEdit(): boolean {
    const edit = current.current;
    if (!edit) return true;
    const album = albumAt(edit.albumId);
    if (!album) {
      setCellEdit(undefined);
      return true;
    }
    const result = albumEdit(album, edit.cell, edit.draft);
    if (result.kind === "refuse") {
      setCellEdit({ ...edit, refusal: result.reason });
      return false;
    }
    if (result.kind === "save" && client) {
      // One update from the values it replaces (TS-21); the save-state layer reports one that isn't saved.
      client.albums
        .update(album.id, (draft) => {
          Object.assign(draft, result.values);
        })
        .isPersisted.promise.catch(() => {});
    }
    closeEdit(edit);
    return true;
  }

  // Leaving Editing mode commits an open editor first, and stays if it refuses (DS-45).
  const commitLatest = useRef(commitEdit);
  useEffect(() => {
    commitLatest.current = commitEdit;
  });
  const open = cellEdit !== undefined;
  useEffect(() => {
    if (!open) return undefined;
    return registerEditor(() => {
      const closed = commitLatest.current();
      if (!closed) grid.current?.querySelector<HTMLInputElement>("[data-cell-editor]")?.focus();
      return closed;
    });
  }, [open, registerEditor]);

  /** Enter opens a cell's editor in Editing mode; F2 opens the title's, switching to Editing first. */
  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!isTextField(event.target) && (event.key === "Enter" || event.key === "F2")) {
      const at = cellAt(event.target);
      const item = at && items[at.row];
      const cell = event.key === "F2" ? "title" : at && editableCells[at.col];
      if (item?.type === "album" && cell && (editing || event.key === "F2") && !offline) {
        event.preventDefault();
        if (event.key === "F2") enterEditing();
        startEdit(item.album, cell);
        return;
      }
    }
    onKeyDown(event);
  }

  const template = (
    compact
      ? ["minmax(0,1fr)", "4.5rem", "3.25rem"]
      : [
          "minmax(0,3fr)",
          "minmax(0,2fr)",
          "7rem",
          ...(showType ? ["6.5rem"] : []),
          ...(showServices ? ["minmax(0,1.5fr)"] : []),
          "3.25rem",
        ]
  ).join(" ");

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
        onKeyDown={onGridKeyDown}
        {...opening.gridProps}
        onDoubleClick={(event) => {
          // A double-click on an editable cell opens its editor, in Editing mode.
          const at = cellAt(event.target);
          const item = at && items[at.row];
          const which = at && editableCells[at.col];
          if (editing && item?.type === "album" && which) startEdit(item.album, which);
        }}
        className="px-4"
      >
        <div role="rowgroup" className="sr-only">
          <div role="row" aria-rowindex={1}>
            <span role="columnheader">{compact ? "Album" : "Title"}</span>
            {!compact && <span role="columnheader">Artist</span>}
            <span role="columnheader">Year</span>
            {showType && <span role="columnheader">Type</span>}
            {showServices && <span role="columnheader">Services</span>}
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
                manual={moves.handles}
                index={virtual.index}
                top={virtual.start}
                template={template}
                compact={compact}
                height={height}
                showType={showType}
                showServices={showServices}
                links={linksByAlbum.get(item.album.id)}
                cellProps={cellProps}
                edit={cellEdit?.albumId === item.album.id ? cellEdit : undefined}
                onDraft={(draft) => {
                  const edit = current.current;
                  if (edit) setCellEdit({ ...edit, draft, refusal: undefined });
                }}
                onCommit={commitEdit}
                onCancel={() => {
                  const edit = current.current;
                  if (edit) closeEdit(edit);
                }}
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
  compact,
  height,
  showType,
  showServices,
  links,
  cellProps,
  edit,
  onDraft,
  onCommit,
  onCancel,
}: {
  album: Album;
  viewKey: string;
  /** Under Manual sort, the row has a drag handle and takes drops (DS-21, DS-49). */
  manual: boolean;
  index: number;
  top: number;
  /** The grid's `grid-template-columns`. */
  template: string;
  /** A phone's row: the artist under the title, in the title's cell (DS-110). */
  compact: boolean;
  height: number;
  showType: boolean;
  /** Whether the services column shows. */
  showServices: boolean;
  /** The album's links: the services column, and Open when it has any (DS-25). */
  links: readonly ServiceLink[] | undefined;
  cellProps: ReturnType<typeof useGridFocus>["cellProps"];
  /** This row's cell being edited, if one is. */
  edit: CellEdit | undefined;
  onDraft: (draft: string) => void;
  onCommit: () => boolean;
  onCancel: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const editor = (which: AlbumCell) =>
    edit?.cell === which ? (
      <CellEditor
        label={`${cellNames[which]} of '${album.title}'`}
        edit={edit}
        onDraft={onDraft}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    ) : undefined;
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
  // The columns after the title's move one left on a phone, whose title cell holds the artist.
  const after = compact ? 0 : 1;
  const cells = [
    <div
      key="title"
      role="gridcell"
      className={cn(cell, compact ? "gap-3 pr-2" : "gap-2.5 pr-3")}
      {...cellProps(index, 0)}
    >
      <Artwork
        title={album.title}
        src={artworkSrc(album)}
        className={compact ? "size-11" : "size-7"}
        letterClassName="text-small"
      />
      {compact ? (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg-primary">{album.title}</span>
          <span className="truncate text-small text-fg-secondary">{album.artistCredit}</span>
        </span>
      ) : (
        (editor("title") ?? <span className="truncate text-fg-primary">{album.title}</span>)
      )}
    </div>,
    ...(compact
      ? []
      : [
          <div
            key="artist"
            role="gridcell"
            className={cn(cell, "pr-3 text-fg-secondary")}
            {...cellProps(index, 1)}
          >
            {editor("artistCredit") ?? <span className="truncate">{album.artistCredit}</span>}
          </div>,
        ]),
    <div
      key="year"
      role="gridcell"
      className={cn(cell, "pr-3 text-fg-secondary")}
      {...cellProps(index, 1 + after)}
    >
      {editor("year") ?? <ChronologyYear album={album} />}
    </div>,
    ...(showType
      ? [
          <div
            key="type"
            role="gridcell"
            className={cn(cell, "pr-3 text-fg-tertiary")}
            {...cellProps(index, 2 + after)}
          >
            <span className="truncate">{typeName(album)}</span>
          </div>,
        ]
      : []),
    ...(showServices
      ? [
          <div
            key="services"
            role="gridcell"
            className={cn(cell, "pr-3 text-fg-tertiary")}
            {...cellProps(index, 2 + after + (showType ? 1 : 0))}
          >
            <span className="truncate">
              <ServiceNames title={album.title} links={links} />
            </span>
          </div>,
        ]
      : []),
    <div
      key="status"
      role="gridcell"
      className={cn(cell, "justify-end gap-1")}
      {...cellProps(index, 2 + after + (showType ? 1 : 0) + (showServices ? 1 : 0))}
    >
      <SaveStateMarker status={status} />
      {(links?.length ?? 0) > 0 && <OpenButton albumId={album.id} title={album.title} />}
    </div>,
  ];
  return (
    <div
      ref={rowRef}
      role="row"
      aria-rowindex={index + 2}
      aria-busy={status === "pending" || status === "unconfirmed" ? true : undefined}
      className={cn(
        "group/row absolute inset-x-0 top-0 grid items-stretch rounded-md px-2 hover:bg-hover",
        drag.dragging && "opacity-40",
      )}
      style={{ height, transform: `translateY(${top}px)`, gridTemplateColumns: template }}
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

/**
 * An inline cell editor (DS-45): Enter saves and Escape discards; leaving the field saves a valid value. A refused
 * value stays, with its reason under the cell, and nothing is sent (X-05).
 */
function CellEditor({
  label,
  edit,
  onDraft,
  onCommit,
  onCancel,
}: {
  label: string;
  edit: CellEdit;
  onDraft: (draft: string) => void;
  onCommit: () => boolean;
  onCancel: () => void;
}) {
  const errorId = useId();
  return (
    <span className="relative flex min-w-0 flex-1">
      <input
        // The editor opens where the person asked for it, so it takes the focus.
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        data-cell-editor
        aria-label={label}
        aria-invalid={edit.refusal !== undefined}
        aria-describedby={edit.refusal === undefined ? undefined : errorId}
        value={edit.draft}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCommit}
        // A double-click inside the field selects text; it doesn't reopen the editor.
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          "h-7 min-w-0 flex-1 rounded-sm border border-strong bg-panel px-1.5 text-fg-primary outline-none focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid",
          edit.refusal !== undefined && "border-status-danger",
        )}
      />
      {edit.refusal !== undefined && (
        <span
          id={errorId}
          className="absolute top-full left-0 z-20 mt-1 rounded-md bg-raised px-2 py-1 text-small whitespace-nowrap text-status-danger shadow-floating"
        >
          {edit.refusal}
        </span>
      )}
    </span>
  );
}

/**
 * The row's Open button (DS-21, DS-25): on hover or focus, and always on touch screens. It is pointer-only, as `O` is
 * its keyboard path, and a click on it opens the chooser rather than the inspector.
 */
function OpenButton({ albumId, title }: { albumId: string; title: string }) {
  const openIn = useOpenIn();
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Open '${title}' in…`}
      data-slot="open-in"
      onClick={(event) => {
        event.stopPropagation();
        openIn?.show(albumId, event.currentTarget);
      }}
      className="invisible flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-tertiary outline-none group-focus-within/row:visible group-hover/row:visible hover:bg-hover hover:text-fg-primary [@media(hover:none)]:visible"
    >
      <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5" />
    </button>
  );
}
