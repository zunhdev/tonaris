// Which album the inspector shows (DS-46, DS-32): the `album` search parameter, on whatever view is open, so a reload
// or a link keeps it. Opening from a view adds a history entry; following the grid's focus replaces it.

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, type FocusEvent, type MouseEvent } from "react";

import { isTextField } from "../shell/shortcuts";
import { useCollectionUi, useMode } from "./collection-ui";
import type { Cell } from "./grid-keys";
import { cellAt } from "./use-grid";

export function useInspector() {
  const navigate = useNavigate();
  const albumId = useSearch({ strict: false, select: (search) => search.album });
  const open = useCallback(
    (id: string, { replace = false }: { replace?: boolean } = {}) =>
      void navigate({ to: ".", search: (previous) => ({ ...previous, album: id }), replace }),
    [navigate],
  );
  const close = useCallback(
    () => void navigate({ to: ".", search: (previous) => ({ ...previous, album: undefined }) }),
    [navigate],
  );
  return { albumId, open, close };
}

/** How long a click waits for a second one, in Editing mode: about the platforms' double-click interval. */
const doubleClickMs = 300;

/**
 * How an album grid opens the inspector (DS-46): a click in an album's cell, except on its drag handle or an editor,
 * and Enter, through the grid's `onActivate`. While the inspector is open, focus moving to another album shows that
 * one instead, in place. The focused album is also what L adds to a list.
 *
 * Opening the inspector narrows the view, so in Editing mode a click waits out a double-click before opening it: a
 * double-click edits the cell (DS-45), and the cell mustn't move between its two clicks.
 */
export function useAlbumOpening(albumAt: (cell: Cell) => string | undefined) {
  const { albumId, open } = useInspector();
  const { setFocusedAlbum } = useCollectionUi();
  const { editing } = useMode();
  const waiting = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(waiting.current), []);
  const show = (id: string) => open(id, { replace: albumId !== undefined });
  return {
    onActivate: (cell: Cell) => {
      const id = albumAt(cell);
      if (id !== undefined) show(id);
      return id !== undefined;
    },
    gridProps: {
      onClick: (event: MouseEvent<HTMLElement>) => {
        if (isTextField(event.target)) return;
        if (event.target instanceof Element && event.target.closest('[data-slot="drag-handle"]'))
          return;
        clearTimeout(waiting.current);
        const at = cellAt(event.target);
        const id = at && albumAt(at);
        if (id === undefined || id === albumId || event.detail > 1) return;
        if (editing && albumId === undefined)
          waiting.current = setTimeout(() => show(id), doubleClickMs);
        else show(id);
      },
      onFocus: (event: FocusEvent<HTMLElement>) => {
        const at = cellAt(event.target);
        const id = at && albumAt(at);
        setFocusedAlbum(id);
        if (id !== undefined && albumId !== undefined && id !== albumId)
          open(id, { replace: true });
      },
      onBlur: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedAlbum(undefined);
      },
    },
  };
}
