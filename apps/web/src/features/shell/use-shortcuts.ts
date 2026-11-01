// The workspace's shortcuts at work (DS-78), and the palette's commands (DS-75): one runner for both, so a command
// does what its key does. Keys come through one keydown listener, in the capture phase so that a key that is a
// shortcut is claimed before the sidebar tree could type ahead with it (decided 22 October 2026). Keys typed in a
// text field, or inside a dialog, popover or menu, are left alone, but for ⌘K in a text field, which searches.
// A command acts on a target: what had the focus when its key was pressed, or when the palette opened.

import { useCapture } from "@/features/capture/capture-context";
import {
  useCollectionUi,
  useMode,
  useStartEditor,
  useViewContainerId,
} from "@/features/collection/collection-ui";
import { useCollectionData } from "@/features/collection/data";
import { useDeleteContainer } from "@/features/collection/delete-containers";
import { useInspector } from "@/features/collection/inspector-state";
import { useOpenIn } from "@/features/open/open-in";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useRecover } from "@/features/trash/recovery";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import { useNarrowScreen } from "./media";
import { createShortcutMatcher, inLayer, type CommandId, type ShortcutAction } from "./shortcuts";

const destinations: Partial<
  Record<CommandId, "/c" | "/unsorted" | "/trash" | "/settings/preferences">
> = {
  "go-root": "/c",
  "go-unsorted": "/unsorted",
  "go-trash": "/trash",
  "go-settings": "/settings/preferences",
};

/** What a command acts on: the focus when it was asked for. */
export type CommandTarget = {
  /** The focused folder or list: the tree's item, else a view's row. */
  container?: string | undefined;
  /** The inspector's album, else the focused one. */
  album?: string | undefined;
  /** The Trash unit whose row had the focus. */
  unit?: string | undefined;
};

/** Edits wait while offline (DS-81); opening, going and viewing don't. */
const edits = new Set<CommandId>([
  "new-list",
  "new-folder",
  "rename",
  "move",
  "delete",
  "delete-album",
  "add-to-list",
]);
const onAlbum = new Set<CommandId>(["add-to-list", "open-in", "delete-album"]);
const onContainer = new Set<CommandId>(["rename", "move", "delete", "share"]);
/** Sharing is online-only: it waits while offline, but isn't a collection edit, so it needs no Editing mode. */
const online = new Set<CommandId>(["share"]);

export type CommandRunner = {
  run: (id: CommandId, target: CommandTarget) => void;
  /** Why the command can't run on `target` now, if it can't. */
  blocked: (id: CommandId, target: CommandTarget) => string | undefined;
  /** The target the live focus gives. */
  target: () => CommandTarget;
};

export function useCommandRunner({
  toggleSidebar,
  openShortcuts,
}: {
  toggleSidebar: () => void;
  openShortcuts: () => void;
}): CommandRunner {
  const navigate = useNavigate();
  const startEditor = useStartEditor();
  const ui = useCollectionUi();
  const viewId = useViewContainerId();
  const mode = useMode();
  const offline = useConnection() === "offline";
  const inspected = useInspector().albumId;
  const capture = useCapture();
  const openIn = useOpenIn();
  const deleteContainer = useDeleteContainer();
  const recover = useRecover();
  const client = useSyncClient();
  const { tree } = useCollectionData();
  const narrow = useNarrowScreen();
  // The latest of each, so what callers hold stays stable.
  const latest = useRef({
    navigate,
    startEditor,
    ui,
    viewId,
    mode,
    offline,
    inspected,
    capture,
    openIn,
    deleteContainer,
    recover,
    client,
    tree,
    narrow,
    toggleSidebar,
    openShortcuts,
  });
  useEffect(() => {
    latest.current = {
      navigate,
      startEditor,
      ui,
      viewId,
      mode,
      offline,
      inspected,
      capture,
      openIn,
      deleteContainer,
      recover,
      client,
      tree,
      narrow,
      toggleSidebar,
      openShortcuts,
    };
  });

  const target = useCallback((): CommandTarget => {
    const now = latest.current;
    return {
      container: now.ui.focused() ?? now.ui.focusedRow(),
      album: now.inspected ?? now.ui.focusedAlbum(),
      unit:
        (typeof document === "undefined"
          ? undefined
          : document.activeElement?.closest("tr[data-unit]")?.getAttribute("data-unit")) ??
        undefined,
    };
  }, []);

  /** Move and Rename also take the folder or list the view shows; Delete takes only a focused one. */
  const containerOf = useCallback(
    (id: CommandId, { container }: CommandTarget) =>
      container ?? (id === "delete" ? undefined : latest.current.viewId),
    [],
  );

  const blocked = useCallback(
    (id: CommandId, on: CommandTarget): string | undefined => {
      const now = latest.current;
      if ((edits.has(id) || online.has(id)) && now.offline) return "You're offline";
      if (onAlbum.has(id) && on.album === undefined) return "Open or focus an album first";
      if (onContainer.has(id) && containerOf(id, on) === undefined)
        return "Focus a folder or list first";
      if (id === "restore" && on.unit === undefined) return "Focus an item in Trash first";
      return undefined;
    },
    [containerOf],
  );

  const run = useCallback(
    (id: CommandId, on: CommandTarget) => {
      const now = latest.current;
      const to = destinations[id];
      // One editor is open at a time: an edit waits for it, as it waits while offline (DS-81).
      const canEdit = !now.offline && !now.ui.editing.current;
      if (to) void now.navigate({ to });
      else if (id === "toggle-sidebar") now.toggleSidebar();
      else if (id === "shortcuts") now.openShortcuts();
      // Choosing how a view looks isn't an edit, so it works offline (X-04).
      else if (id === "view-options") now.ui.openViewOptions();
      else if (id === "toggle-mode") now.mode.choose(now.mode.editing ? "view" : "edit");
      else if (id === "share") {
        // The owner's dialog, desktop only (DS-65); it waits while offline.
        const container = containerOf(id, on);
        if (container !== undefined && !now.offline && !now.narrow) now.ui.startShare(container);
      } else if (id === "open-in") {
        // Opening isn't an edit: it works in Viewing mode and offline. The chooser sits by what has the focus
        // (DS-25).
        const anchor = document.activeElement === document.body ? null : document.activeElement;
        if (on.album !== undefined) now.openIn?.show(on.album, anchor);
      } else if (id === "restore") {
        // As R does in Trash's table: no other check (TON-59).
        const unit = on.unit === undefined ? undefined : now.client?.trashUnits.get(on.unit);
        if (unit) {
          now.recover({
            unitId: unit.id,
            rootId: unit.rootId,
            kind: unit.kind,
            name: unit.name,
            parentId: unit.parentId,
          });
        }
      } else if (id === "capture") {
        // The dialog switches to Editing itself, and waits while offline (DS-48).
        if (!now.ui.editing.current) now.capture?.openDialog();
      } else if (!canEdit) {
        // Every remaining command is an edit.
      } else if (id === "new-list" || id === "new-folder") {
        now.startEditor({ mode: "new", kind: id === "new-folder" ? "folder" : "list" });
      } else if (id === "rename") {
        // As F2 in the tree: the name's editor, in place.
        const container = now.tree.byId.get(containerOf(id, on) ?? "");
        if (container) now.startEditor({ mode: "rename", id: container.id, name: container.name });
      } else if (id === "move" || id === "delete") {
        // Edit intent switches to Editing first (DS-45).
        const container = containerOf(id, on);
        if (container === undefined) return;
        now.mode.enterEditing();
        if (id === "move") now.ui.startMove(container);
        else now.deleteContainer(container);
      } else if (id === "add-to-list" || id === "delete-album") {
        if (on.album === undefined) return;
        now.mode.enterEditing();
        if (id === "add-to-list") now.ui.startAddToList(on.album);
        else now.ui.startDeleteAlbum(on.album);
      }
    },
    [containerOf],
  );

  return { run, blocked, target };
}

export function useShortcuts({
  runner: { run, target },
  openSearch,
}: {
  runner: CommandRunner;
  openSearch: () => void;
}): void {
  const latest = useRef({ run, target, openSearch });
  useEffect(() => {
    latest.current = { run, target, openSearch };
  });

  useEffect(() => {
    const match = createShortcutMatcher();
    const act = (action: ShortcutAction) => {
      const now = latest.current;
      // Searching works anywhere, offline and in Viewing mode too (DS-75).
      if (action === "search") now.openSearch();
      else now.run(action, now.target());
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || inLayer(event.target)) return;
      const matched = match(event);
      if (matched === undefined) return;
      // Claimed: the tree doesn't type ahead with it, nor the browser act on it.
      event.preventDefault();
      if (matched !== "pending") act(matched);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
