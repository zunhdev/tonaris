// The command palette (DS-75, FR-12.2): one place for content and commands, opened anywhere in the workspace with ⌘K
// or the sidebar's Search item. Each keystroke searches the collection on this device (search-index.ts), and the
// results come in groups — Folders, Lists, Albums, then Commands — up to 8 each, with "Show all {n}" to see the rest
// in place. Every result shows where it is, and the matched part of its name in the original spelling. A leading `>`
// lists commands only; an empty field shows what was opened lately and the commands run most (decided with the
// creator, 29 October 2026). Enter or a click opens a folder or list, or an album in its first list, or Unsorted,
// with the inspector; ⌘Enter opens an album on its own page. A command runs once the palette has closed, on what
// had the focus when it opened, as its key would (use-shortcuts.ts); one that can't run says why. The field is a
// combobox over a listbox (DS-115), whose rows are virtualized so a group of thousands stays quick; the active
// option is always rendered, for `aria-activedescendant`. Built only while open.

// The combobox pattern's listbox, groups and options are plain elements with ARIA roles: virtualized rows are
// absolutely positioned, which a native `select` and its options can't be.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { Artwork, artworkSrc } from "@/features/collection/artwork";
import { useCollectionUi, useMode } from "@/features/collection/collection-ui";
import { useCollectionData } from "@/features/collection/data";
import { ContainerIcon } from "@/features/collection/icons";
import { chronology } from "@/features/collection/order";
import { commandUses, recentItems } from "@/features/shell/device";
import { useShell } from "@/features/shell/shell-context";
import {
  commands,
  frequentCommands,
  type Command,
  type CommandId,
} from "@/features/shell/shortcuts";
import type { CommandRunner, CommandTarget } from "@/features/shell/use-shortcuts";
import { useNavigate } from "@tanstack/react-router";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { CornerDownLeft, Search } from "lucide-react";
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

import {
  matchRange,
  searchKey,
  searchTier,
  type Album,
  type Container,
  type SearchTier,
} from "@tonaris/domain";
import { CommandDialog, CommandDialogContent } from "@tonaris/ui/components/command";
import { cn } from "@tonaris/ui/lib/utils";

import {
  albumPlace,
  buildSearchIndex,
  containerLocation,
  search,
  type SearchIndex,
} from "./search-index";

/** How many results a group shows until it is expanded (DS-75). */
const groupLimit = 8;
/** How many recent items an empty palette shows. */
const recentShown = 8;

type Group = "recent" | "folders" | "lists" | "albums" | "commands" | "frequent";

/** A command as the palette shows it: its label now, and why it can't run, if it can't. */
type CommandRow = { command: Command; label: string; blocked: string | undefined };

type Row =
  | { type: "heading"; group: Group; title: string }
  | { type: "container"; group: Group; container: Container }
  | { type: "album"; group: Group; album: Album }
  | ({ type: "command"; group: Group } & CommandRow)
  | { type: "more"; group: Group; total: number };

type Section = {
  group: Group;
  title: string;
  items: readonly Row[];
  /** Shows every item, without "Show all". */
  whole?: boolean;
};

const heights: Record<Row["type"], number> = {
  heading: 32,
  container: 36,
  album: 48,
  command: 36,
  more: 32,
};

/** The listbox's rows: each section's heading, its items, and "Show all" while it is collapsed. */
function rowsOf(sections: readonly Section[], expanded: ReadonlySet<Group>): Row[] {
  const rows: Row[] = [];
  for (const { group, title, items, whole } of sections) {
    if (items.length === 0) continue;
    rows.push({ type: "heading", group, title });
    const shown = whole || expanded.has(group) ? items : items.slice(0, groupLimit);
    rows.push(...shown);
    if (shown.length < items.length) rows.push({ type: "more", group, total: items.length });
  }
  return rows;
}

const rowKey = (row: Row): string => {
  if (row.type === "container") return `${row.group}-container-${row.container.id}`;
  if (row.type === "album") return `${row.group}-album-${row.album.id}`;
  if (row.type === "command") return `${row.group}-command-${row.command.id}`;
  return `${row.type}-${row.group}`;
};

/** Commands matching `text` by label or title, best match first, then in list order; all of them for no text. */
function matchCommands(rows: readonly CommandRow[], text: string): CommandRow[] {
  const key = searchKey(text);
  if (key === "") return [...rows];
  const matched: { row: CommandRow; at: number; tier: SearchTier }[] = [];
  for (const [at, row] of rows.entries()) {
    const byLabel = searchTier(key, searchKey(row.label));
    const byTitle = searchTier(key, searchKey(row.command.title));
    const tier =
      byLabel === undefined || (byTitle !== undefined && byTitle < byLabel) ? byTitle : byLabel;
    if (tier !== undefined) matched.push({ row, at, tier });
  }
  return matched.toSorted((a, b) => a.tier - b.tier || a.at - b.at).map(({ row }) => row);
}

export function SearchPalette({
  open,
  onOpenChange,
  target,
  runner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What had the focus when it opened, for its commands. */
  target: CommandTarget;
  runner: CommandRunner;
}) {
  const field = useRef<HTMLInputElement>(null);
  /** The command chosen, run once the palette has closed and handed the focus back. */
  const pending = useRef<CommandId>(undefined);
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        const id = pending.current;
        pending.current = undefined;
        if (!isOpen && id) runner.run(id, target);
      }}
    >
      <CommandDialogContent label="Search" initialFocus={field}>
        <PaletteBody
          field={field}
          target={target}
          runner={runner}
          close={() => onOpenChange(false)}
          onCommand={(id) => {
            pending.current = id;
            onOpenChange(false);
          }}
        />
      </CommandDialogContent>
    </CommandDialog>
  );
}

function PaletteBody({
  field,
  target,
  runner,
  close,
  onCommand,
}: {
  field: RefObject<HTMLInputElement | null>;
  target: CommandTarget;
  runner: CommandRunner;
  close: () => void;
  onCommand: (id: CommandId) => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const { accountId } = useCollectionUi();
  const { editing } = useMode();
  const { sidebarHidden } = useShell();
  const { tree, albumsById, entriesByList } = useCollectionData();
  const index = useMemo(
    () => buildSearchIndex({ tree, albumsById, entriesByList }),
    [tree, albumsById, entriesByList],
  );
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<Group>>(new Set());

  const commandRows = useMemo(
    () =>
      commands.map((command): CommandRow => ({
        command,
        label:
          command.id === "toggle-mode"
            ? editing
              ? "Switch to viewing"
              : "Switch to editing"
            : command.id === "toggle-sidebar"
              ? sidebarHidden
                ? "Show sidebar"
                : "Hide sidebar"
              : command.title,
        blocked: runner.blocked(command.id, target),
      })),
    [editing, sidebarHidden, runner, target],
  );
  // Read once a session: what was opened before the palette did, and what it ran before.
  const [recent] = useState(() => recentItems.read(accountId));
  const [frequent] = useState(() => frequentCommands(commandUses.read(accountId)));

  const commandMode = query.trimStart().startsWith(">");
  /** What the field matches: its text, less a leading `>`. */
  const text = commandMode ? query.trimStart().slice(1) : query;
  const blank = text.trim() === "";

  const sections = useMemo((): Section[] => {
    const toCommand =
      (group: Group) =>
      (row: CommandRow): Row => ({
        type: "command",
        group,
        ...row,
      });
    if (commandMode) {
      return [
        {
          group: "commands",
          title: "Commands",
          items: matchCommands(commandRows, text).map(toCommand("commands")),
          whole: true,
        },
      ];
    }
    if (blank) {
      const opened = recent.flatMap((item): Row[] => {
        if (item.kind === "album") {
          const album = albumsById.get(item.id);
          return album ? [{ type: "album", group: "recent", album }] : [];
        }
        // Deleted or in Trash, it isn't in the tree: it drops out.
        const container = tree.byId.get(item.id);
        return container?.kind === item.kind
          ? [{ type: "container", group: "recent", container }]
          : [];
      });
      const byId = new Map(commandRows.map((row) => [row.command.id, row]));
      return [
        { group: "recent", title: "Recent", items: opened.slice(0, recentShown), whole: true },
        {
          group: "frequent",
          title: "Frequent commands",
          items: frequent.flatMap((each) => {
            const row = byId.get(each);
            return row ? [toCommand("frequent")(row)] : [];
          }),
          whole: true,
        },
      ];
    }
    const results = search(index, text);
    return [
      {
        group: "folders",
        title: "Folders",
        items: results.folders.map((container) => ({
          type: "container",
          group: "folders",
          container,
        })),
      },
      {
        group: "lists",
        title: "Lists",
        items: results.lists.map((container) => ({ type: "container", group: "lists", container })),
      },
      {
        group: "albums",
        title: "Albums",
        items: results.albums.map((album) => ({ type: "album", group: "albums", album })),
      },
      {
        group: "commands",
        title: "Commands",
        items: matchCommands(commandRows, text).map(toCommand("commands")),
      },
    ];
  }, [commandMode, blank, text, commandRows, recent, frequent, albumsById, tree, index]);

  const rows = useMemo(() => rowsOf(sections, expanded), [sections, expanded]);
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
    if (row.type === "command") {
      // A command that can't run stays put, saying why.
      if (row.blocked !== undefined) return;
      commandUses.add(accountId, row.command.id);
      onCommand(row.command.id);
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

  const total = blank ? 0 : sections.reduce((sum, section) => sum + section.items.length, 0);
  const listboxId = `${id}-results`;
  const virtualRows = virtualizer.getVirtualItems();
  const shownGroups = sections.filter((section) => section.items.length > 0);

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
          placeholder="Search, or type > for commands…"
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
          {shownGroups.map(({ group, title }) => (
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
                    query={text}
                    index={index}
                    onPoint={() => at >= 0 && setActive(at)}
                    onChoose={(standalone) => choose(row, standalone)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {rows.length === 0 && (
        <p className="px-4 py-6 text-center text-fg-tertiary">
          {commandMode
            ? `No commands match '${text.trim()}'.`
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
  const blocked = row.type === "command" ? row.blocked : undefined;
  const optionProps = {
    id,
    role: "option",
    "aria-selected": active,
    "aria-disabled": blocked === undefined ? undefined : true,
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
  if (row.type === "command") {
    return (
      <div {...optionProps}>
        <span className={cn(blocked === undefined ? "text-fg-secondary" : "text-fg-disabled")}>
          <CornerDownLeft strokeWidth={1.5} aria-hidden className="size-4" />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            blocked === undefined ? "text-fg-primary" : "text-fg-tertiary",
          )}
        >
          <Highlighted text={row.label} query={query} />
        </span>
        {blocked !== undefined && (
          <span className="max-w-[45%] shrink-0 truncate text-small text-fg-tertiary">
            <span className="sr-only">, unavailable: </span>
            {blocked}
          </span>
        )}
        <span className="flex shrink-0 gap-1">
          <span className="sr-only">, shortcut {row.command.keys.join(" ")}</span>
          {row.command.keys.map((key) => (
            <kbd
              key={key}
              aria-hidden
              className="min-w-5 rounded-sm border border-subtle bg-panel px-1 text-center text-small text-fg-secondary"
            >
              {key}
            </kbd>
          ))}
        </span>
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
