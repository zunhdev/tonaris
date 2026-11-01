// The sidebar tree (DS-27, DS-31; FR-01.3): the owner's folders and lists, then Unsorted, Shared with me and Trash,
// as one ARIA tree in its flat form (each item's level, position and set size), with a single tab stop. Items are
// links, so Enter and a click open the view, and a view can open in a new tab. The current view's item is
// selected; closing a folder that holds it selects the folder (TON-121). ↑/↓, Home/End, ←/→ and type-ahead move
// focus; letters that are shortcuts act as shortcuts instead (decided 22 October 2026). F2 renames, and new folders and lists are named inline (editing.ts). Each folder or
// list shows its save state, is busy while saving, and is highlighted when changed elsewhere (DS-80, DS-82, DS-83).
// Folders and lists can be dragged onto a folder, or onto Collection, to move them (DS-49, drag.tsx). Shared with
// me opens to the folders and lists shared with the person, each opening to what's inside it in the person's own sort,
// live while open; they open the shared view (TON-130).

import { isUnderway } from "@/client/sync/save-states";
import { usePendingApprovals } from "@/features/connections/pending-approvals";
import { usePendingInvitations } from "@/features/sharing/pending-invitations";
import { useSharedEntries } from "@/features/sharing/shared-entries";
import { useShareStream } from "@/features/sharing/use-share-stream";
import { SaveStateMarker } from "@/features/sync/save-state-marker";
import { useLiveHighlight, useSaveState } from "@/features/sync/save-states";
import { useConnection } from "@/features/sync/sync-provider";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Ellipsis,
  Inbox,
  MailOpen,
  ShieldCheck,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { ContainerKind } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { useCollectionUi, useEditor, useStartEditor, useViewContainerId } from "./collection-ui";
import { ContainerMenu, type ContainerMenuTarget } from "./container-menu";
import { sortForView, useCollectionData } from "./data";
import { useDestination, useTreeDrag } from "./drag";
import type { Editor } from "./editing";
import { ContainerIcon } from "./icons";
import { NameEditor } from "./name-editor";
import {
  ancestorsOf,
  buildSharedTree,
  places,
  sharedClosedKey,
  typeAhead,
  visibleRows,
  type Place,
  type SharedTree,
  type TreeRow,
} from "./tree";

/** A row of the tree: a folder or list, a place, or the editor naming a new folder or list. */
type Row = TreeRow | { type: "new"; level: number; kind: ContainerKind; parentId: string | null };

const keyOf = (row: Row) =>
  row.type === "container"
    ? row.container.id
    : row.type === "shared"
      ? row.item.id
      : row.type === "place"
        ? row.place
        : "new";

/** What a row opens and closes by, and whether it's open; undefined for a row that doesn't open. */
function opening(row: Row): { key: string; open: boolean } | undefined {
  if (row.type === "container") {
    return row.container.kind === "folder"
      ? { key: row.container.id, open: row.expanded }
      : undefined;
  }
  if (row.type === "shared") {
    return row.item.kind === "folder" && row.item.available
      ? { key: row.item.id, open: row.expanded }
      : undefined;
  }
  if (row.type === "place" && row.expanded !== undefined) {
    return { key: row.place, open: row.expanded };
  }
  return undefined;
}

/** The row ← goes to: a folder's, or Shared with me for a shared folder or list at its top. */
function parentKey(row: Row): string | undefined {
  if (row.type === "container") return row.container.parentId ?? undefined;
  if (row.type === "shared") return row.item.parentId ?? "shared";
  return undefined;
}

/** The shared items from the top of their share down to `id`, by ID. */
function sharedPath(tree: SharedTree, id: string): string[] {
  const path: string[] = [];
  let item = tree.byId.get(id);
  while (item && path.length <= tree.byId.size) {
    path.unshift(item.id);
    item = item.parentId === null ? undefined : tree.byId.get(item.parentId);
  }
  return path;
}

const placePaths: Record<
  Place,
  "/unsorted" | "/shared" | "/invitations" | "/settings/connections" | "/trash"
> = {
  unsorted: "/unsorted",
  shared: "/shared",
  invitations: "/invitations",
  approvals: "/settings/connections",
  trash: "/trash",
};

const placeIcons: Record<Place, LucideIcon> = {
  unsorted: Inbox,
  shared: Users,
  invitations: MailOpen,
  approvals: ShieldCheck,
  trash: Trash2,
};

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
  const inShare = useLocation({ select: (location) => (location.search as { c?: unknown }).c });
  const viewId = useViewContainerId();
  // A shared view's folder or list: `/shared/{root}`, with `?c=` inside the share.
  const sharedRoot = /^\/shared\/([^/]+)$/.exec(pathname)?.[1];
  const sharedView =
    sharedRoot === undefined ? undefined : typeof inShare === "string" ? inShare : sharedRoot;
  const selected = viewId ?? sharedView ?? placeAt(pathname);
  const { expand, setExpanded } = ui;
  const navigate = useNavigate();

  const { entries, reread: rereadShared } = useSharedEntries();
  const sharedTree = useMemo(
    () =>
      buildSharedTree(entries ?? [], (siblings, parentId) =>
        sortForView(siblings, parentId, {
          views: data.views,
          defaults: data.defaults,
          keys: data.keys,
        }),
      ),
    [entries, data.views, data.defaults, data.keys],
  );

  // The current view's folders open, so its item can be seen (DS-27): once for each view, and again when it moves,
  // never on a later expand or collapse, so a folder holding it can still be closed (TON-121).
  const viewPath =
    viewId === undefined || !data.tree.byId.has(viewId)
      ? undefined
      : [...ancestorsOf(data.tree, viewId).map((folder) => folder.id), viewId].join("/");
  const shownPath = useRef<string>(undefined);
  useEffect(() => {
    if (viewPath === undefined || viewPath === shownPath.current) return;
    shownPath.current = viewPath;
    expand(viewPath.split("/").slice(0, -1));
  }, [viewPath, expand]);

  // A shared view's item can be seen too: Shared with me and the shared folders above it open (TON-130).
  const sharedViewPath =
    sharedView === undefined || !sharedTree.byId.has(sharedView)
      ? undefined
      : sharedPath(sharedTree, sharedView).join("/");
  const shownSharedPath = useRef<string>(undefined);
  useEffect(() => {
    if (sharedViewPath === undefined || sharedViewPath === shownSharedPath.current) return;
    shownSharedPath.current = sharedViewPath;
    setExpanded(sharedClosedKey, false);
    expand(sharedViewPath.split("/").slice(0, -1));
  }, [sharedViewPath, expand, setExpanded]);

  /**
   * Opens or closes a folder, a shared one or Shared with me. Closing one that holds the current view selects it, by
   * opening its view (TON-121).
   */
  function toggle(key: string, open: boolean) {
    if (key === "shared") {
      setExpanded(sharedClosedKey, !open);
      if (!open && sharedView !== undefined) void navigate({ to: "/shared" });
      return;
    }
    ui.setExpanded(key, open);
    if (open) return;
    if (viewPath?.split("/").slice(0, -1).includes(key)) {
      void navigate({ to: "/f/$folderId", params: { folderId: key } });
    }
    const item = sharedTree.byId.get(key);
    if (item && sharedViewPath?.split("/").slice(0, -1).includes(key)) {
      void navigate({
        to: "/shared/$containerId",
        params: { containerId: item.rootId },
        search: item.id === item.rootId ? {} : { c: item.id },
      });
    }
  }

  const invitations = usePendingInvitations();
  const approvals = usePendingApprovals().length;
  const rows = useMemo(
    () =>
      withEditor(
        visibleRows(data.tree, ui.expanded, {
          invitations: invitations > 0,
          approvals: approvals > 0,
          shared: sharedTree,
        }),
        editor,
      ),
    [data.tree, ui.expanded, editor, invitations, approvals, sharedTree],
  );

  const [focusedKey, setFocusedKey] = useState<string>();
  const elements = useRef(new Map<string, HTMLElement>());
  /** A row to focus once it is rendered, such as a new folder's after its editor closes. */
  const pending = useRef<string>(undefined);
  const typed = useRef({ text: "", at: 0 });
  /** The folder or list whose menu is open (TON-117). */
  const [menu, setMenu] = useState<ContainerMenuTarget>();

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
    const folder = opening(row);
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
        if (folder && !folder.open) toggle(folder.key, true);
        else if (folder && (rows[index + 1]?.level ?? 0) > row.level) focusIndex(index + 1);
        return;
      case "ArrowLeft": {
        handled();
        const parent = parentKey(row);
        if (folder?.open) toggle(folder.key, false);
        else if (parent !== undefined) focusKey(parent);
        return;
      }
      case "F2":
        if (row.type !== "container" || offline) return;
        handled();
        startEditor({ mode: "rename", id: row.container.id, name: row.container.name });
        return;
      case "ContextMenu":
      case "F10":
        // The row's menu, as its ⋯ opens it (TON-117): the Menu key, or Shift+F10.
        if (row.type !== "container" || (event.key === "F10" && !event.shiftKey)) return;
        handled();
        setMenu({ id: row.container.id, name: row.container.name, row: event.target });
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
        if (row.type === "shared") {
          return (
            <SharedRow
              key={key}
              row={row}
              register={register(key)}
              selected={selected === key}
              tabbable={tabbable === key}
              onToggle={() => toggle(key, !row.expanded)}
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
              aria-expanded={row.expanded}
              aria-selected={selected === key}
              tabIndex={tabbable === key ? 0 : -1}
              className={cn(rowClass, row.place === "unsorted" && "mt-2")}
              style={indent(row.level)}
            >
              {row.expanded === undefined ? (
                <span className="w-3.5 shrink-0" />
              ) : (
                <Chevron open={row.expanded} onToggle={() => toggle(key, !row.expanded)} />
              )}
              <Icon strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              {row.place === "unsorted" && <Count n={data.unsorted} />}
              {row.place === "invitations" && (
                <Count n={invitations} one="pending invitation" many="pending invitations" />
              )}
              {row.place === "approvals" && (
                <Count n={approvals} one="request to approve" many="requests to approve" />
              )}
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
            onToggle={() => toggle(key, !row.expanded)}
            menuOpen={menu?.id === key}
            onMenu={(element) =>
              setMenu({ id: row.container.id, name: row.container.name, row: element })
            }
          />
        );
      })}
      <ContainerMenu target={menu} onClose={() => setMenu(undefined)} />
      {rows.map((row) =>
        row.type === "shared" && row.item.parentId === null && row.expanded ? (
          <ShareFollower key={row.item.id} rootId={row.item.id} reread={rereadShared} />
        ) : null,
      )}
    </div>
  );
}

/** Follows an open shared folder's stream, so the tree shows its owner's saves (TON-130). */
function ShareFollower({ rootId, reread }: { rootId: string; reread: () => void }) {
  useShareStream(`/v1/shared/${rootId}/stream`, true, reread);
  return null;
}

/** A folder's chevron, for the pointer only: ← and → do the same from the keyboard. */
function Chevron({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <span
      aria-hidden
      data-slot="row-chevron"
      className="flex size-3.5 shrink-0 items-center justify-center rounded-sm hover:bg-hover"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
    >
      <ChevronRight
        strokeWidth={1.5}
        className={cn("size-3.5 transition-transform", open && "rotate-90")}
      />
    </span>
  );
}

/**
 * A folder or list shared with the person (TON-130): at the top of Shared with me with its owner's name after it, or
 * inside a shared folder. It opens the shared view. One that can't be opened is dimmed, without its name (DS-67).
 */
function SharedRow({
  row,
  register,
  selected,
  tabbable,
  onToggle,
}: {
  row: Extract<TreeRow, { type: "shared" }>;
  register: (element: HTMLElement | null) => void;
  selected: boolean;
  tabbable: boolean;
  onToggle: () => void;
}) {
  const { item, expanded } = row;
  const isFolder = item.kind === "folder" && item.available;
  const name = item.name ?? "No longer available";
  return (
    <Link
      ref={register}
      to="/shared/$containerId"
      params={{ containerId: item.rootId }}
      search={item.id === item.rootId ? {} : { c: item.id }}
      role="treeitem"
      data-key={item.id}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={isFolder ? expanded : undefined}
      aria-selected={selected}
      tabIndex={tabbable ? 0 : -1}
      className={cn(rowClass, !item.available && "opacity-60")}
      style={indent(row.level)}
    >
      {isFolder ? (
        <Chevron open={expanded} onToggle={onToggle} />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      {item.kind ? (
        <ContainerIcon kind={item.kind} />
      ) : (
        <Users strokeWidth={1.5} aria-hidden className="size-4 shrink-0" />
      )}
      <span className="min-w-0 truncate">{name}</span>
      {item.parentId === null && (
        <span className="max-w-[45%] shrink-0 truncate text-fg-tertiary">· {item.owner}</span>
      )}
    </Link>
  );
}

/** A count, said with its noun, so the item reads "Doom 2 albums" and shows "Doom 2". */
function Count({
  n,
  one = "album",
  many = "albums",
}: {
  n: number;
  one?: string;
  many?: string;
}): ReactNode {
  return (
    <span className="shrink-0 text-small text-fg-tertiary tabular-nums">
      {n}
      <span className="sr-only">{` ${n === 1 ? one : many}`}</span>
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
  menuOpen,
  onMenu,
}: {
  row: Extract<TreeRow, { type: "container" }>;
  register: (element: HTMLElement | null) => void;
  selected: boolean;
  tabbable: boolean;
  count: number | undefined;
  onToggle: () => void;
  /** Whether this row's menu is open, which keeps its ⋯ shown. */
  menuOpen: boolean;
  /** Opens the row's menu by `row` (TON-117). */
  onMenu: (row: HTMLElement) => void;
}) {
  const { container, expanded } = row;
  const ref = useRef<HTMLAnchorElement | null>(null);
  useLiveHighlight(container.id, ref);
  const status = useSaveState(container.id);
  const isFolder = container.kind === "folder";
  const drag = useTreeDrag(container);
  const destination = useDestination(container.id, isFolder);
  const props = {
    ref: (element: HTMLAnchorElement | null) => {
      ref.current = element;
      register(element);
      drag.setNodeRef(element);
      destination.setNodeRef(element);
    },
    ...drag.listeners,
    role: "treeitem",
    "data-key": container.id,
    "aria-level": row.level,
    "aria-posinset": row.posInSet,
    "aria-setsize": row.setSize,
    "aria-expanded": isFolder ? expanded : undefined,
    "aria-selected": selected,
    "aria-busy": isUnderway(status) || undefined,
    tabIndex: tabbable ? 0 : -1,
    className: cn(
      rowClass,
      "group/row",
      destination.over && "bg-accent-soft",
      drag.dragging && "opacity-40",
    ),
    style: indent(row.level),
  };
  const content = (
    <>
      {isFolder ? (
        <Chevron open={expanded} onToggle={onToggle} />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <ContainerIcon kind={container.kind} />
      <span className="min-w-0 flex-1 truncate">{container.name}</span>
      {count !== undefined && (
        // The ⋯ takes the count's place while it shows.
        <span className={cn("contents", menuOpen ? "*:hidden" : "group-hover/row:*:hidden")}>
          <Count n={count} />
        </span>
      )}
      {/* Pointer only, like the chevron: the Menu key and Shift+F10 open the same menu (TON-117). */}
      <span
        aria-hidden
        data-slot="row-menu"
        className={cn(
          "size-5 shrink-0 items-center justify-center rounded-sm text-fg-tertiary hover:bg-selected hover:text-fg-primary",
          menuOpen ? "flex" : "hidden group-hover/row:flex",
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const element = event.currentTarget.closest<HTMLElement>('[role="treeitem"]');
          if (element) onMenu(element);
        }}
      >
        <Ellipsis strokeWidth={1.5} className="size-3.5" />
      </span>
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
