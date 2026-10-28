// The workspace's shortcuts at work (DS-78): one keydown listener, in the capture phase so that a key that is a
// shortcut is claimed before the sidebar tree could type ahead with it (decided 22 October 2026). Keys typed in a
// text field, or inside a dialog, popover or menu, are left alone.

import { useCapture } from "@/features/capture/capture-context";
import {
  useCollectionUi,
  useMode,
  useStartEditor,
  useViewContainerId,
} from "@/features/collection/collection-ui";
import { useInspector } from "@/features/collection/inspector-state";
import { useOpenIn } from "@/features/open/open-in";
import { useConnection } from "@/features/sync/sync-provider";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { createShortcutMatcher, inLayer, type ShortcutAction } from "./shortcuts";

const destinations: Partial<
  Record<ShortcutAction, "/c" | "/unsorted" | "/trash" | "/settings/preferences">
> = {
  "go-root": "/c",
  "go-unsorted": "/unsorted",
  "go-trash": "/trash",
  "go-settings": "/settings/preferences",
};

export function useShortcuts({
  toggleSidebar,
  openShortcuts,
}: {
  toggleSidebar: () => void;
  openShortcuts: () => void;
}): void {
  const navigate = useNavigate();
  const startEditor = useStartEditor();
  const ui = useCollectionUi();
  const { editing, openViewOptions } = ui;
  const viewId = useViewContainerId();
  const mode = useMode();
  const offline = useConnection() === "offline";
  const inspected = useInspector().albumId;
  const capture = useCapture();
  const openIn = useOpenIn();
  // The latest of each, so the listener is installed once.
  const latest = useRef({
    navigate,
    startEditor,
    editing,
    offline,
    toggleSidebar,
    openShortcuts,
    openViewOptions,
    ui,
    viewId,
    mode,
    inspected,
    capture,
    openIn,
  });
  useEffect(() => {
    latest.current = {
      navigate,
      startEditor,
      editing,
      offline,
      toggleSidebar,
      openShortcuts,
      openViewOptions,
      ui,
      viewId,
      mode,
      inspected,
      capture,
      openIn,
    };
  });

  useEffect(() => {
    const match = createShortcutMatcher();
    const act = (action: ShortcutAction) => {
      const now = latest.current;
      const to = destinations[action];
      if (to) void now.navigate({ to });
      else if (action === "toggle-sidebar") now.toggleSidebar();
      else if (action === "shortcuts") now.openShortcuts();
      // Choosing how a view looks isn't an edit, so it works offline (X-04).
      else if (action === "view-options") now.openViewOptions();
      // Moving is an edit: it waits while offline (DS-81), as N does. It moves the focused tree item, else the
      // focused folder or list row of a view, else the folder or list the view shows.
      else if (action === "move") {
        const target = now.ui.focused() ?? now.ui.focusedRow() ?? now.viewId;
        if (!now.offline && !now.editing.current && target !== undefined) {
          // Edit intent switches to Editing first (DS-45).
          now.mode.enterEditing();
          now.ui.startMove(target);
        }
      } else if (action === "add-to-list") {
        // Adding to a list is an edit too. It acts on the inspector's album, else the focused album of a view.
        const albumId = now.inspected ?? now.ui.focusedAlbum();
        if (!now.offline && !now.editing.current && albumId !== undefined) {
          now.mode.enterEditing();
          now.ui.startAddToList(albumId);
        }
      } else if (action === "open-in") {
        // Opening isn't an edit: it works in Viewing mode and offline. It acts on the inspector's album, else the
        // focused album, and the chooser sits by what has the focus (DS-25).
        const albumId = now.inspected ?? now.ui.focusedAlbum();
        const anchor = document.activeElement === document.body ? null : document.activeElement;
        if (albumId !== undefined) now.openIn?.show(albumId, anchor);
      } else if (action === "capture") {
        // Capturing is an edit: the dialog switches to Editing first, and waits while offline (DS-48).
        if (!now.editing.current) now.capture?.openDialog();
      } else if (action === "toggle-mode") {
        now.mode.choose(now.mode.editing ? "view" : "edit");
      }
      // Edit controls wait while offline (DS-81), and one editor is open at a time.
      else if (!now.offline && !now.editing.current) {
        now.startEditor({ mode: "new", kind: action === "new-folder" ? "folder" : "list" });
      }
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
