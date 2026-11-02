// Media queries as React state: whether the screen is a phone's (DS-110) and whether the window is wide enough for the
// inspector beside the view (DS-30). Each follows its query as the window changes.

import { useCallback, useSyncExternalStore } from "react";

/** Whether `query` matches, following it; `fallback` where there is no window to ask, as on the server. */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const media = globalThis.matchMedia?.(query);
      media?.addEventListener("change", listener);
      return () => media?.removeEventListener("change", listener);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia?.(query).matches ?? fallback,
    () => fallback,
  );
}

/** Whether the screen is narrower than the desktop app (DS-110): there the app is for browsing. */
export function useNarrowScreen(): boolean {
  return useMediaQuery("(max-width: 767px)", false);
}

/** Whether the window is wide enough for the inspector beside the view (DS-30). */
export function useWideScreen(): boolean {
  return useMediaQuery("(min-width: 1100px)", true);
}
