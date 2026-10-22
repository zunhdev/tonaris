// The sidebar tree (DS-27, DS-31; FR-01.3): the owner's folders and lists, then Unsorted, Shared with me and Trash,
// as one ARIA tree in its flat form (each item's level, position and set size), with a single tab stop. Items are
// links, so Enter and a click open the view, and a view can open in a new tab. The current view's item is
// selected. ↑/↓, Home/End, ←/→ and type-ahead move focus; letters that are shortcuts act as shortcuts instead
// (decided 22 October 2026). F2 renames, and new folders and lists are named inline (editing.ts). Each folder or
// list shows its save state, is busy while saving, and is highlighted when changed elsewhere (DS-80, DS-82, DS-83).

import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useConnection } from "@/features/sync/sync-provider";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Inbox, Trash2, Users, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { ContainerKind } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionUi, useEditor, useStartEditor, useViewContainerId } from "./collection-ui";
import { useCollectionData } from "./data";
import type { Editor } from "./editing";
import { ContainerIcon } from "./icons";
import { NameEditor } from "./name-editor";
import { ancestorsOf, places, typeAhead, visibleRows, type Place, type TreeRow } from "./tree";

/** A row of the tree: a folder or list, a place, or the editor naming a new folder or list. */
type Row = TreeRow | { type: "new"; level: number; kind: ContainerKind; parentId: string | null };

const keyOf = (row: Row) =>
  row.type === "container" ? row.container.id : row.type === "place" ? row.place : "new";

const placePaths: Record<Place, "/unsorted" | "/shared" | "/trash"> = {
  unsorted: "/unsorted",
  shared: "/shared",
  trash: "/trash",
};

const placeIcons: Record<Place, LucideIcon> = { unsorted: Inbox, shared: Users, trash: Trash2 };

/** The place a path shows, if it shows one. */
function placeAt(pathname: string): Place | undefined {
  return places.find(({ place }) => placePaths[place] === pathname)?.place;
}

/** The rows with a new folder or list's editor at the end of its parent's, as the last of them. */
function withEditor(rows: TreeRow[], editor: Editor | undefined): Row[] {
  if (editor?.mode !== "create") return rows;
  const { parentId, kind } = editor;
  if (parentId === null) {
    const at = rows.findIndex((row) => row.type === "place");
    return [...rows.slice(0, at), { type: "new", level: 1, kind, parentId }, ...rows.slice(at)];
  }
  const parent = rows.findIndex((row) => row.type === "container" && row.container.id === parentId);
  const parentLevel = rows[parent]?.level;
  if (parent === -1 || parentLevel === undefined) return rows;
  let at = parent + 1;
  while ((rows[at]?.level ?? 0) > parentLevel) at += 1;
  return [
    ...rows.slice(0, at),
    { type: "new", level: parentLevel + 1, kind, parentId },
    ...rows.slice(at),
  ];
}

const rowClass =
  "flex h-7 min-w-0 items-center gap-1.5 rounded-md pr-2 text-fg-secondary outline-none hover:bg-hover hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus aria-selected:bg-selected aria-selected:text-fg-primary";

/** The left padding that shows an item's level. */
const indent = (level: number) => ({ paddingLeft: `${4 + (level - 1) * 12}px` });

export function CollectionTree() {
  const data = useCollectionData();
  const ui = useCollectionUi();
  const editor = useEditor();
  const startEditor = useStartEditor();
  const offline = useConnection() === "offline";
  const pathname = useLocation({ select: (location) => location.pathname });
  const viewId = useViewContainerId();
  const selected = viewId ?? placeAt(pathname);
  const { expand } = ui;

  // The current view's folders open, so its item can be seen (DS-27).
  useEffect(() => {
    if (viewId !== undefined) expand(ancestorsOf(data.tree, viewId).map((folder) => folder.id));
  }, [viewId, data.tree, expand]);

  const rows = useMemo(
    () => withEditor(visibleRows(data.tree, ui.expanded), editor),
    [data.tree, ui.expanded, editor],
  );

  const [focusedKey, setFocusedKey] = useState<string>();
  const elements = useRef(new Map<string, HTMLElement>());
  /** A row to focus once it is rendered, such as a new folder's after its editor closes. */
  const pending = useRef<string>(undefined);
  const typed = useRef({ text: "", at: 0 });

  const keys = rows.map(keyOf);
  const tabbable =
    (focusedKey !== undefined && keys.includes(focusedKey) && focusedKey) ||
    (selected !== undefined && keys.includes(selected) && selected) ||
    keys[0];

  useEffect(() => {
    const key = pending.current;
    const element = key === undefined ? undefined : elements.current.get(key);
    if (!element) return;
    pending.current = undefined;
    element.focus();
  });

  function focusKey(key: string) {
    setFocusedKey(key);
    const element = elements.current.get(key);
    if (element) element.focus();
    else pending.current = key;
  }

  function focusIndex(index: number) {
    const row = rows[index];
    if (row) focusKey(keyOf(row));
  }

  function register(key: string) {
    return (element: HTMLElement | null) => {
      if (element) elements.current.set(key, element);
      else elements.current.delete(key);
    };
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // The editor's field handles its own keys; shortcuts already claimed theirs.
    if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return;
    if (event.target.tagName === "INPUT") return;
    const index = keys.indexOf(event.target.dataset.key ?? "");
    const row = rows[index];
    if (!row) return;
    const folder = row.type === "container" && row.container.kind === "folder" ? row : undefined;
    const handled = () => {
      event.preventDefault();
      // Any other key starts the typed name afresh.
      typed.current = { text: "", at: 0 };
    };
    switch (event.key) {
      case "ArrowDown":
        handled();
        focusIndex(Math.min(index + 1, rows.length - 1));
        return;
      case "ArrowUp":
        handled();
        focusIndex(Math.max(index - 1, 0));
        return;
      case "Home":
        handled();
        focusIndex(0);
        return;
      case "End":
        handled();
        focusIndex(rows.length - 1);
        return;
      case "ArrowRight":
        handled();
        if (folder && !folder.expanded) ui.setExpanded(folder.container.id, true);
        else if (folder && (rows[index + 1]?.level ?? 0) > folder.level) focusIndex(index + 1);
        return;
      case "ArrowLeft":
        handled();
        if (folder?.expanded) ui.setExpanded(folder.container.id, false);
        else if (row.type === "container" && row.container.parentId !== null) {
          focusKey(row.container.parentId);
        }
        return;
      case "F2":
        if (row.type !== "container" || offline) return;
        handled();
        startEditor({ mode: "rename", id: row.container.id, name: row.container.name });
        return;
      default:
    }
    if (
      event.key.length !== 1 ||
      event.key === " " ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    // Letters that aren't shortcuts type ahead, within 700 ms of each other (DS-27).
    const now = event.timeStamp;
    const text = now - typed.current.at < 700 ? typed.current.text + event.key : event.key;
    typed.current = { text, at: now };
    const treeRows = rows.filter((each): each is TreeRow => each.type !== "new");
    const from = treeRows.findIndex((each) => keyOf(each) === keyOf(row));
    const found = typeAhead(treeRows, Math.max(0, from), text);
    if (found !== undefined) {
      event.preventDefault();
      const target = treeRows[found];
      if (target) focusKey(keyOf(target));
    }
  }

  function closeEditor(saved?: string) {
    ui.editing.stop();
    if (saved !== undefined) pending.current = saved;
  }

  return (
    <div
      role="tree"
      aria-label="Collection"
      // Its items take the focus; the tree itself only when clicked between them.
      tabIndex={-1}
      className="flex flex-col gap-px"
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (!(event.target instanceof HTMLElement)) return;
        const key = event.target.dataset.key;
        if (key !== undefined) setFocusedKey(key);
        ui.setFocused(data.tree.byId.has(key ?? "") ? key : undefined);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) ui.setFocused(undefined);
      }}
    >
      {rows.map((row) => {
        const key = keyOf(row);
        if (row.type === "new") {
          return (
            <NameEditor
              key={key}
              level={row.level}
              kind={row.kind}
              parentId={row.parentId}
              editor={editor?.mode === "create" ? editor : undefined}
              onClose={closeEditor}
            />
          );
        }
        if (row.type === "place") {
          const Icon = placeIcons[row.place];
          return (
            <Link
              key={key}
              ref={register(key)}
              to={placePaths[row.place]}
              role="treeitem"
              data-key={key}
              aria-level={row.level}
              aria-posinset={row.posInSet}
              aria-setsize={row.setSize}
              aria-selected={selected === key}
              tabIndex={tabbable === key ? 0 : -1}
              className={cn(rowClass, row.place === "unsorted" && "mt-2")}
              style={indent(row.level)}
            >
              <span className="w-3.5 shrink-0" />
              <Icon strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              {row.place === "unsorted" && <Count n={data.unsorted} />}
            </Link>
          );
        }
        if (editor?.mode === "rename" && editor.id === row.container.id) {
          return (
            <NameEditor
              key={key}
              level={row.level}
              kind={row.container.kind}
              parentId={row.container.parentId}
              editor={editor}
              onClose={closeEditor}
            />
          );
        }
        return (
          <ContainerRow
            key={key}
            row={row}
            register={register(key)}
            selected={selected === key}
            tabbable={tabbable === key}
            count={row.container.kind === "list" ? (data.counts.get(key) ?? 0) : undefined}
            onToggle={() => ui.setExpanded(key, !row.expanded)}
          />
        );
      })}
    </div>
  );
}

/** An album count, said with its noun, so the item reads "Doom 2 albums" and shows "Doom 2". */
function Count({ n }: { n: number }): ReactNode {
  return (
    <span className="shrink-0 text-small text-fg-tertiary tabular-nums">
      {n}
      <span className="sr-only">{n === 1 ? " album" : " albums"}</span>
    </span>
  );
}

function ContainerRow({
  row,
  register,
  selected,
  tabbable,
  count,
  onToggle,
}: {
  row: Extract<TreeRow, { type: "container" }>;
  register: (element: HTMLElement | null) => void;
  selected: boolean;
  tabbable: boolean;
  count: number | undefined;
  onToggle: () => void;
}) {
  const { container, expanded } = row;
  const ref = useRef<HTMLAnchorElement | null>(null);
  useLiveHighlight(container.id, ref);
  const status = useSaveState(container.id);
  const isFolder = container.kind === "folder";
  const props = {
    ref: (element: HTMLAnchorElement | null) => {
      ref.current = element;
      register(element);
    },
    role: "treeitem",
    "data-key": container.id,
    "aria-level": row.level,
    "aria-posinset": row.posInSet,
    "aria-setsize": row.setSize,
    "aria-expanded": isFolder ? expanded : undefined,
    "aria-selected": selected,
    "aria-busy": status === "pending" || status === "unconfirmed" ? true : undefined,
    tabIndex: tabbable ? 0 : -1,
    className: rowClass,
    style: indent(row.level),
  };
  const content = (
    <>
      {isFolder ? (
        // Pointer only: ← and → do the same from the keyboard.
        <span
          aria-hidden
          className="flex size-3.5 shrink-0 items-center justify-center rounded-sm hover:bg-hover"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle();
          }}
        >
          <ChevronRight
            strokeWidth={1.5}
            className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
          />
        </span>
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <ContainerIcon kind={container.kind} />
      <span className="min-w-0 flex-1 truncate">{container.name}</span>
      {count !== undefined && <Count n={count} />}
      <SaveStateMarker status={status} />
    </>
  );
  return isFolder ? (
    <Link {...props} to="/f/$folderId" params={{ folderId: container.id }}>
      {content}
    </Link>
  ) : (
    <Link {...props} to="/l/$listId" params={{ listId: container.id }}>
      {content}
    </Link>
  );
}
