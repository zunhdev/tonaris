// Selecting albums (DS-21, DS-45, DS-50, DS-78; TON-231): in Editing mode, a view's albums are selected by X on the
// focused one or its checkbox, and the selection grows with ⇧↑ and ⇧↓ or a ⇧-click, from the album last chosen. Esc
// clears it, and so does leaving Editing mode or the view. Albums that leave the view, deleted or removed from it,
// leave the selection. Selected, ⌫ in a list, ⌘⌫ and L act on all of them at once, as the selection bar's buttons do.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/** The view's selected albums, and the ways to change them. */
export type AlbumSelection = {
  /** The selected albums' IDs, in the view's order. */
  ids: readonly string[];
  has: (id: string) => boolean;
  /** Selects `id`, or deselects it if it is selected; it becomes where a range starts. */
  toggle: (id: string) => void;
  /** Adds the albums from where the last range started, else `from`, to `to`, in the view's order. */
  extend: (from: string, to: string) => void;
  clear: () => void;
};

const SelectionContext = createContext<AlbumSelection | undefined>(undefined);
export const SelectionProvider = SelectionContext;

/** The view's selection; undefined outside a view whose albums can be selected. */
export function useAlbumSelection(): AlbumSelection | undefined {
  return useContext(SelectionContext);
}

const none: ReadonlySet<string> = new Set();

/** What is chosen, for the view and mode it was chosen in, and where a range starts. */
type Chosen = { scope: string; ids: ReadonlySet<string>; anchor: string | undefined };

/**
 * The selection of a view showing `order`, its albums' IDs in the order shown. `enabled` is Editing mode on a
 * computer: without it nothing is selected. Leaving Editing mode or the view (`viewKey`) clears it.
 */
export function useSelectionState(
  order: readonly string[],
  enabled: boolean,
  viewKey: string,
): AlbumSelection {
  const scope: string = viewKey;
  const [state, setState] = useState<Chosen>({ scope, ids: none, anchor: undefined });
  // Leaving Editing mode clears it; X in Viewing mode selects while it switches, so entering keeps it.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    if (!enabled) setState({ scope, ids: none, anchor: undefined });
  }
  // Chosen in another view is nothing here.
  const current = state.scope === scope ? state : { scope, ids: none, anchor: undefined };

  const ids = useMemo(
    () => (enabled && current.ids.size > 0 ? order.filter((id) => current.ids.has(id)) : []),
    [enabled, current.ids, order],
  );
  const shown = useMemo(() => new Set(ids), [ids]);

  const update = useCallback(
    (change: (now: Chosen) => Chosen) =>
      setState((now) =>
        change(now.scope === scope ? now : { scope, ids: none, anchor: undefined }),
      ),
    [scope],
  );

  const toggle = useCallback(
    (id: string) =>
      update((now) => {
        const next = new Set(now.ids);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { scope, ids: next, anchor: id };
      }),
    [update, scope],
  );

  const extend = useCallback(
    (from: string, to: string) =>
      update((now) => {
        const anchor = now.anchor ?? from;
        const start = order.indexOf(anchor);
        const end = order.indexOf(to);
        if (start === -1 || end === -1) return now;
        const range = order.slice(Math.min(start, end), Math.max(start, end) + 1);
        return { scope, ids: new Set([...now.ids, ...range]), anchor };
      }),
    [update, order, scope],
  );

  const clear = useCallback(
    () => update(() => ({ scope, ids: none, anchor: undefined })),
    [update, scope],
  );

  return useMemo(
    () => ({ ids, has: (id: string) => shown.has(id), toggle, extend, clear }),
    [ids, shown, toggle, extend, clear],
  );
}
