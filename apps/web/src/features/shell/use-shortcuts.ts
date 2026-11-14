// The workspace's shortcuts at work (DS-78), and the palette's commands (DS-75): one runner for both, so a command
// does what its key does. Keys come through one keydown listener, in the capture phase so that a key that is a
// shortcut is claimed before the sidebar tree could type ahead with it (decided 22 October 2026). Keys typed in a
// text field, or inside a dialog, popover or menu, are left alone, but for ⌘K in a text field, which searches.
// A command acts on a target: what had the focus when its key was pressed, or when the palette opened.

import { useNarrowScreen } from "@/common/media";
import {
  createShortcutMatcher,
  inLayer,
  phoneCommands,
  type CommandId,
  type CommandRunner,
  type CommandTarget,
  type ShortcutAction,
} from "@/common/shortcuts";
import { useCapture } from "@/features/capture/capture-context";
import { useCollectionDialogs } from "@/features/collection/collection-dialogs";
import { useMode } from "@/features/collection/collection-mode";
import {
  useCollectionUi,
  useStartEditor,
  useViewContainerId,
} from "@/features/collection/collection-ui";
import { useCollectionData } from "@/features/collection/data";
import { useDeleteContainer } from "@/features/collection/delete-containers";
import { useInspector } from "@/features/collection/inspector-state";
import { sharingRefusal, useCollectionPlace } from "@/features/collection/place";
import { useRemoveFromList } from "@/features/collection/remove-from-list";
import { useOpenIn } from "@/features/open/open-in";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useRecover } from "@/features/trash/recovery";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

const destinations: Partial<
  Record<CommandId, "/c" | "/unsorted" | "/trash" | "/settings/preferences">
> = {
  "go-root": "/c",
  "go-unsorted": "/unsorted",
  "go-trash": "/trash",
  "go-settings": "/settings/preferences",
};

/** Edits wait while offline (DS-81); opening, going and viewing don't. */
const edits = new Set<CommandId>([
  "new-list",
  "new-folder",
  "rename",
  "move",
  "color",
  "delete",
  "delete-album",
  "add-to-list",
]);
const onAlbum = new Set<CommandId>(["add-to-list", "open-in", "delete-album"]);
const onContainer = new Set<CommandId>(["rename", "move", "color", "delete", "share"]);
/** Sharing is online-only: it waits while offline, but isn't a collection edit, so it needs no Editing mode. */
const online = new Set<CommandId>(["share"]);

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
  const dialogs = useCollectionDialogs();
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
  const place = useCollectionPlace();
  const removeFromList = useRemoveFromList();
  // The latest of each, so what callers hold stays stable.
  const latest = useRef({
    navigate,
    startEditor,
    ui,
    dialogs,
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
    place,
    removeFromList,
    toggleSidebar,
    openShortcuts,
  });
  useEffect(() => {
    latest.current = {
      navigate,
      startEditor,
      ui,
      dialogs,
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
      place,
      removeFromList,
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

  /** In a list, the album the grid's focus is on, and the list: what ⌫ takes it out of (DS-50, TON-228). */
  const albumInList = useCallback(() => {
    const now = latest.current;
    const list = now.viewId === undefined ? undefined : now.tree.byId.get(now.viewId);
    const albumId = now.ui.focusedAlbum();
    const album = albumId === undefined ? undefined : now.client?.albums.get(albumId);
    return list?.kind === "list" && album ? { album, list } : undefined;
  }, []);

  /** The view's item "Move to position…" acts on: the focused album, else the focused folder or list row (TON-230). */
  const positioned = useCallback((on: CommandTarget) => {
    const moves = latest.current.ui.positioner();
    const id = [on.album, latest.current.ui.focusedRow()].find(
      (each) => each !== undefined && moves?.standing(each) !== undefined,
    );
    return moves && id !== undefined ? { moves, id } : undefined;
  }, []);

  const positionRefusal = useCallback(
    (on: CommandTarget): string | undefined => {
      const item = positioned(on);
      if (!item) return "Focus an album, folder or list in the view first";
      if (!item.moves.manual) return "Rearranging works in manual order";
      return undefined;
    },
    [positioned],
  );

  const blocked = useCallback(
    (id: CommandId, on: CommandTarget): string | undefined => {
      const now = latest.current;
      // Phones view only (X-04): what changes the collection waits for a computer.
      if (now.narrow && !phoneCommands.has(id) && id !== "share") return "Edit on a computer";
      if ((edits.has(id) || online.has(id)) && now.offline) return "You're offline";
      if (onAlbum.has(id) && on.album === undefined) return "Open or focus an album first";
      if (id === "delete" && containerOf(id, on) === undefined && albumInList() === undefined)
        return "Focus a folder or list, or an album in a list, first";
      if (onContainer.has(id) && id !== "delete" && containerOf(id, on) === undefined)
        return "Focus a folder or list first";
      if (id === "restore" && on.unit === undefined) return "Focus an item in Trash first";
      if (id === "move-to-position") return positionRefusal(on);
      if (id === "share") return sharingRefusal(now.place, now.narrow);
      return undefined;
    },
    [containerOf, albumInList, positionRefusal],
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
      else if (id === "move-to-position") {
        // Presentation, not an edit: no Editing mode, and offline too (DS-49).
        const item = positioned(on);
        if (item?.moves.manual) now.dialogs.startPositioning(item.id);
      } else if (id === "toggle-mode") now.mode.choose(now.mode.editing ? "view" : "edit");
      else if (id === "share") {
        // The owner's dialog, desktop only (DS-65); it waits while offline.
        const container = containerOf(id, on);
        if (
          container !== undefined &&
          !now.offline &&
          sharingRefusal(now.place, now.narrow) === undefined
        )
          now.dialogs.startShare(container);
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
      } else if (id === "move" || id === "color" || id === "delete") {
        // Edit intent switches to Editing first (DS-45).
        const container = containerOf(id, on);
        // ⌫ on an album in a list takes it out of the list (DS-50, TON-228).
        const inList = id === "delete" && container === undefined ? albumInList() : undefined;
        if (inList) {
          now.mode.enterEditing();
          now.removeFromList(inList.album, inList.list);
          return;
        }
        if (container === undefined) return;
        now.mode.enterEditing();
        if (id === "move") now.dialogs.startMove(container);
        else if (id === "color") now.dialogs.startColor(container);
        else now.deleteContainer(container);
      } else if (id === "add-to-list" || id === "delete-album") {
        if (on.album === undefined) return;
        now.mode.enterEditing();
        if (id === "add-to-list") now.dialogs.startAddToList(on.album);
        else now.dialogs.startDeleteAlbum(on.album);
      }
    },
    [containerOf, albumInList, positioned],
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
