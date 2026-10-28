// The command palette's search (DS-75, FR-12.2): ⌘K or the sidebar's Search item opens it anywhere in the workspace.
// Each keystroke searches the collection on this device (search-index.ts), and the results come in groups — Folders,
// Lists, Albums — up to 8 each, with "Show all {n}" to see the rest in place. Every result shows where it is, and
// the matched part of its name in the original spelling. Enter or a click opens a folder or list, or an album in its
// first list, or Unsorted, with the inspector; ⌘Enter opens an album on its own page. The field is a combobox over
// a listbox (DS-115), whose rows are virtualized so a group of thousands stays quick; the active option is always
// rendered, for `aria-activedescendant`. Built only while open.

// The combobox pattern's listbox, groups and options are plain elements with ARIA roles: virtualized rows are
// absolutely positioned, which a native `select` and its options can't be.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { Artwork, artworkSrc } from "@/features/collection/artwork";
import { useCollectionData } from "@/features/collection/data";
import { ContainerIcon } from "@/features/collection/icons";
import { chronology } from "@/features/collection/order";
import { useNavigate } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { matchRange, type Album, type Container } from "@tonaris/domain";
import { CommandDialog, CommandDialogContent } from "@tonaris/ui/components/command";
import { cn } from "@tonaris/ui/lib/utils";

import {
  albumPlace,
  buildSearchIndex,
  containerLocation,
  search,
  type SearchIndex,
  type SearchResults,
} from "./search-index";

/** How many results a group shows until it is expanded (DS-75). */
const groupLimit = 8;

type Group = keyof SearchResults;

const groups: { group: Group; title: string }[] = [
  { group: "folders", title: "Folders" },
  { group: "lists", title: "Lists" },
  { group: "albums", title: "Albums" },
];

type Row =
  | { type: "heading"; group: Group; title: string }
  | { type: "container"; group: Group; container: Container }
  | { type: "album"; group: Group; album: Album }
  | { type: "more"; group: Group; total: number };

const heights: Record<Row["type"], number> = { heading: 32, container: 36, album: 48, more: 32 };

/** The listbox's rows: each group's heading, its results, and "Show all" while it is collapsed. */
function rowsOf(results: SearchResults, expanded: ReadonlySet<Group>): Row[] {
  const rows: Row[] = [];
  const add = <T,>(group: Group, title: string, items: readonly T[], toRow: (item: T) => Row) => {
    if (items.length === 0) return;
    rows.push({ type: "heading", group, title });
    const shown = expanded.has(group) ? items : items.slice(0, groupLimit);
    for (const item of shown) rows.push(toRow(item));
    if (shown.length < items.length) rows.push({ type: "more", group, total: items.length });
  };
  for (const { group, title } of groups) {
    if (group === "albums")
      add(group, title, results.albums, (album) => ({ type: "album", group, album }));
    else
      add(group, title, results[group], (container) => ({ type: "container", group, container }));
  }
  return rows;
}

const rowKey = (row: Row): string => {
  if (row.type === "container") return `container-${row.container.id}`;
  if (row.type === "album") return `album-${row.album.id}`;
  return `${row.type}-${row.group}`;
};

export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogContent label="Search" initialFocus={field}>
        <PaletteBody field={field} close={() => onOpenChange(false)} />
      </CommandDialogContent>
    </CommandDialog>
  );
}

function PaletteBody({
  field,
  close,
}: {
  field: RefObject<HTMLInputElement | null>;
  close: () => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const { tree, albumsById, entriesByList } = useCollectionData();
  const index = useMemo(
    () => buildSearchIndex({ tree, albumsById, entriesByList }),
    [tree, albumsById, entriesByList],
  );
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<Group>>(new Set());
  const results = useMemo(() => search(index, query), [index, query]);
  const rows = useMemo(() => rowsOf(results, expanded), [results, expanded]);
  const options = useMemo(
    () => rows.flatMap((row, at) => (row.type === "heading" ? [] : [at])),
    [rows],
  );
  /** The active option, as its place in `options`. */
  const [active, setActive] = useState(0);
  const activeRow = options[Math.min(active, options.length - 1)];
  const activeOption = activeRow === undefined ? undefined : rows[activeRow];
  const optionId = (row: Row) => `${id}-${rowKey(row)}`;

  const scroller = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (at) => heights[rows[at]?.type ?? "container"],
    getItemKey: (at) => {
      const row = rows[at];
      return row ? rowKey(row) : at;
    },
    overscan: 6,
    paddingStart: 4,
    paddingEnd: 4,
    // The active option stays rendered, so `aria-activedescendant` always names an element.
    rangeExtractor: useCallback(
      (range: Parameters<typeof defaultRangeExtractor>[0]) => {
        const shown = defaultRangeExtractor(range);
        if (activeRow === undefined || shown.includes(activeRow)) return shown;
        return [...shown, activeRow].toSorted((a, b) => a - b);
      },
      [activeRow],
    ),
  });

  useEffect(() => {
    if (activeRow !== undefined) virtualizer.scrollToIndex(activeRow, { align: "auto" });
  }, [activeRow, virtualizer]);

  const choose = (row: Row, standalone: boolean) => {
    if (row.type === "heading") return;
    if (row.type === "more") {
      setExpanded((current) => new Set([...current, row.group]));
      return;
    }
    close();
    if (row.type === "container") {
      const { container } = row;
      if (container.kind === "folder")
        void navigate({ to: "/f/$folderId", params: { folderId: container.id } });
      else void navigate({ to: "/l/$listId", params: { listId: container.id } });
      return;
    }
    const albumId = row.album.id;
    if (standalone) {
      void navigate({ to: "/a/$albumId", params: { albumId } });
      return;
    }
    const { listId } = albumPlace(index, albumId);
    if (listId === undefined) void navigate({ to: "/unsorted", search: { album: albumId } });
    else void navigate({ to: "/l/$listId", params: { listId }, search: { album: albumId } });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && options.length > 0) {
      event.preventDefault();
      const from = Math.min(active, options.length - 1);
      setActive((from + step + options.length) % options.length);
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      choose(activeOption, event.metaKey || event.ctrlKey);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      // ⌘K again closes it.
      event.preventDefault();
      close();
    }
  };

  const total = results.folders.length + results.lists.length + results.albums.length;
  const blank = query.trim() === "";
  const listboxId = `${id}-results`;
  const virtualRows = virtualizer.getVirtualItems();

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-subtle px-4">
        <Search strokeWidth={1.5} aria-hidden className="size-4 shrink-0 text-fg-tertiary" />
        <input
          ref={field}
          role="combobox"
          aria-label="Search"
          aria-expanded={rows.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption && optionId(activeOption)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search folders, lists and albums…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-12 min-w-0 flex-1 bg-transparent text-[0.875rem]/5 text-fg-primary outline-none placeholder:text-fg-tertiary max-md:text-[1rem]"
        />
      </div>
      <div
        ref={scroller}
        id={listboxId}
        role="listbox"
        aria-label="Results"
        className={cn("min-h-0 overflow-y-auto max-md:flex-1", rows.length === 0 && "hidden")}
      >
        <div
          role="presentation"
          className="relative"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {groups.map(({ group, title }) =>
            results[group].length === 0 ? null : (
              <div key={group} role="group" aria-label={title}>
                {virtualRows.map((item) => {
                  const row = rows[item.index];
                  if (row?.group !== group) return null;
                  const at = options.indexOf(item.index);
                  return (
                    <ResultRow
                      key={item.key}
                      row={row}
                      id={optionId(row)}
                      top={item.start}
                      height={item.size}
                      active={item.index === activeRow}
                      query={query}
                      index={index}
                      onPoint={() => at >= 0 && setActive(at)}
                      onChoose={(standalone) => choose(row, standalone)}
                    />
                  );
                })}
              </div>
            ),
          )}
        </div>
      </div>
      {rows.length === 0 && (
        <p className="px-4 py-6 text-center text-fg-tertiary">
          {blank
            ? "Search folder and list names, album titles and artists."
            : `No results for '${query.trim()}'.`}
        </p>
      )}
      <output className="sr-only">
        {blank ? "" : total === 0 ? "No results" : total === 1 ? "1 result" : `${total} results`}
      </output>
    </>
  );
}

function ResultRow({
  row,
  id,
  top,
  height,
  active,
  query,
  index,
  onPoint,
  onChoose,
}: {
  row: Row;
  id: string;
  top: number;
  height: number;
  active: boolean;
  query: string;
  index: SearchIndex;
  onPoint: () => void;
  onChoose: (standalone: boolean) => void;
}) {
  const style = { top, height };
  if (row.type === "heading") {
    return (
      <div
        aria-hidden
        style={style}
        className="absolute inset-x-0 flex items-end px-4 pb-1 text-small font-medium text-fg-tertiary"
      >
        {row.title}
      </div>
    );
  }
  const optionProps = {
    id,
    role: "option",
    "aria-selected": active,
    style,
    onPointerMove: onPoint,
    // The field keeps the focus.
    onMouseDown: (event: MouseEvent) => event.preventDefault(),
    onClick: (event: MouseEvent) => onChoose(event.metaKey || event.ctrlKey),
    className: cn(
      "absolute inset-x-2 flex cursor-default items-center gap-3 rounded-md px-2 text-base",
      active && "bg-hover",
    ),
  } as const;
  if (row.type === "more") {
    return (
      <div {...optionProps} className={cn(optionProps.className, "text-fg-secondary")}>
        Show all {row.total}
      </div>
    );
  }
  if (row.type === "container") {
    const { container } = row;
    return (
      <div {...optionProps}>
        <span className="text-fg-secondary">
          <ContainerIcon kind={container.kind} />
        </span>
        <span className="min-w-0 flex-1 truncate text-fg-primary">
          <Highlighted text={container.name} query={query} />
        </span>
        <Location>{containerLocation(index.tree, container)}</Location>
      </div>
    );
  }
  const { album } = row;
  const place = albumPlace(index, album.id);
  const { year, recorded } = chronology(album);
  return (
    <div {...optionProps}>
      <Artwork
        title={album.title}
        src={artworkSrc(album)}
        className="size-6"
        letterClassName="text-micro"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-fg-primary">
          <Highlighted text={album.title} query={query} />
        </span>
        <span className="truncate text-small text-fg-secondary">
          <Highlighted text={album.artistCredit} query={query} />
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {recorded && "rec. "}
          {year}
        </span>
      </span>
      <Location>
        {place.path}
        {place.others > 0 && ` +${place.others} more`}
      </Location>
    </div>
  );
}

function Location({ children }: { children: ReactNode }) {
  return (
    <span className="max-w-[45%] shrink-0 truncate text-small text-fg-tertiary">
      <span className="sr-only">, in </span>
      {children}
    </span>
  );
}

/** `text` with the part `query` matches marked, in its own spelling (DS-75). */
function Highlighted({ text, query }: { text: string; query: string }) {
  const range = matchRange(query, text);
  if (!range) return text;
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-accent-soft text-inherit">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
