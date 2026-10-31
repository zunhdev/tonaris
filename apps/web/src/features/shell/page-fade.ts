// A page switch eases the new page in (DS-17, TON-140): what is below the header fades in, opacity only, while the old
// page has gone at once. What stays from page to page stays still: the header, the Settings and Admin tabs, and the
// offline banner, each marked `data-page-chrome`. A change that keeps the path, such as an album opened, isn't a
// switch. Back, forward and reduced motion show the page at once; for back and forward, that keeps a fade from
// following Safari's own swipe-back.
//
// The fade starts on the router's `onRendered`, which comes after the new page has committed and before the browser
// paints it, so the page never shows at full opacity first.

import { useRouter } from "@tanstack/react-router";
import { useEffect, type RefObject } from "react";

/** The fades' ID, which the browser tests wait out. */
export const pageFadeId = "page-fade";

const fade: KeyframeAnimationOptions = {
  id: pageFadeId,
  duration: 120,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};

/** Fades `main`'s page in on each switch. */
export function usePageFade(main: RefObject<HTMLElement | null>): void {
  const router = useRouter();
  useEffect(() => {
    let traversal = false;
    let running: Animation[] = [];
    const stopHistory = router.history.subscribe(({ action }) => {
      traversal = action.type === "BACK" || action.type === "FORWARD" || action.type === "GO";
    });
    const stopRendered = router.subscribe("onRendered", ({ pathChanged }) => {
      if (!pathChanged) return;
      for (const each of running) each.cancel();
      running = [];
      const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (traversal || reduced || !main.current) return;
      running = [...main.current.children]
        .filter((child) => !child.matches("[data-page-chrome]"))
        .map((child) => child.animate({ opacity: [0, 1] }, fade));
    });
    return () => {
      stopHistory();
      stopRendered();
      for (const each of running) each.cancel();
    };
  }, [router, main]);
}
