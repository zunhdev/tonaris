// The album panel's slide (DS-17, TON-159): in from the right over 200 ms with the enter easing, and back out with the
// exit easing; the phone's sheet slides up and down instead. Under reduced motion it fades. Back and Forward, and a
// panel open when the shell first renders, as after a reload, show it at once, as page switches do (page-fade.ts).
// Switching albums in the panel doesn't move it.
//
// Closing is `?album=` going away, which would drop the panel at once, so this keeps the album it showed until the
// panel has slid out. Meanwhile the shell gives the view its width back and keeps the panel inert.

import type { InspectorPlacement } from "@/features/collection/inspector";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

const duration = 200;
const enter = "cubic-bezier(0.2, 0, 0, 1)";
const exit = "cubic-bezier(0.4, 0, 1, 1)";

/** The panel's keyframes, from out of view to in place. */
function slide(placement: InspectorPlacement): Keyframe[] {
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
    return [{ opacity: 0 }, { opacity: 1 }];
  const away = placement === "sheet" ? "translateY(100%)" : "translateX(100%)";
  return [{ transform: away }, { transform: "none" }];
}

/**
 * Slides `panel` in as `albumId` appears and out once it has gone. Returns the album the panel shows, the one sliding
 * out included, and whether it is closing.
 */
export function useInspectorSlide(
  panel: RefObject<HTMLElement | null>,
  albumId: string | undefined,
  placement: InspectorPlacement,
): { shown: string | undefined; closing: boolean } {
  const router = useRouter();
  // Whether the last navigation went through the history: Back, Forward or Go.
  const traversal = useRef(false);
  useEffect(
    () =>
      router.history.subscribe(({ action }) => {
        traversal.current =
          action.type === "BACK" || action.type === "FORWARD" || action.type === "GO";
      }),
    [router],
  );
  const placed = useRef(placement);
  useLayoutEffect(() => {
    placed.current = placement;
  }, [placement]);

  // The album whose panel is sliding out, once `?album=` has gone.
  const [leaving, setLeaving] = useState<string>();
  const [previous, setPrevious] = useState(albumId);
  if (previous !== albumId) {
    setPrevious(albumId);
    setLeaving(albumId === undefined ? previous : undefined);
  }

  // In, before the panel's first paint; not for a panel already open as the shell first renders.
  const open = albumId !== undefined;
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    const element = panel.current;
    if (!opening || traversal.current || !element) return undefined;
    const animation = element.animate(slide(placed.current), { duration, easing: enter });
    return () => animation.cancel();
  }, [open, panel]);

  // Out, then gone. Opening another album meanwhile cancels it.
  useLayoutEffect(() => {
    const element = panel.current;
    if (leaving === undefined || !element) return undefined;
    const animation = element.animate(slide(placed.current).toReversed(), {
      duration: traversal.current ? 0 : duration,
      easing: exit,
      fill: "forwards",
    });
    animation.finished.then(
      () => setLeaving(undefined),
      () => {},
    );
    return () => animation.cancel();
  }, [leaving, panel]);

  return { shown: albumId ?? leaving, closing: albumId === undefined && leaving !== undefined };
}
