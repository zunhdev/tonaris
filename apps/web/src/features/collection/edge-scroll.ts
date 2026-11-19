// Scrolling a list while a drag nears its top or bottom edge (DS-49, TON-303), in place of dnd-kit's auto-scroll.
// dnd-kit scrolls by fractions of a pixel every 5 ms. Safari rounds each such step to whole pixels where the page keeps
// the list's position, but not where it paints the list, so within a second the two were tens of pixels apart: the
// pointer hovered and lit rows above the one under it until the next scroll by hand. Here a list moves once a frame,
// by whole pixels set outright, which Safari keeps together.

import { useEffect } from "react";

/** The share of a list's height, at each end, where a drag scrolls it, as dnd-kit had it. */
const band = 0.2;
/** How fast a list scrolls with the pointer at its very edge, in pixels a second; slower further in. */
const fastest = 1200;

/**
 * How fast a list scrolls, in pixels a second, with the pointer at `y`: up (negative) in its top band, down in its
 * bottom band, faster nearer the edge. Only the way the pointer has moved during the drag (`toward`), so a drag that
 * starts near an edge doesn't scroll straight away.
 */
export function edgeSpeed(
  list: { top: number; height: number },
  y: number,
  toward: { up: boolean; down: boolean },
): number {
  const reach = list.height * band;
  const intoTop = list.top + reach - y;
  if (toward.up && intoTop > 0 && y >= list.top) return -fastest * Math.min(1, intoTop / reach);
  const intoBottom = y - (list.top + list.height - reach);
  if (toward.down && intoBottom > 0 && y <= list.top + list.height) {
    return fastest * Math.min(1, intoBottom / reach);
  }
  return 0;
}

/** The innermost list under the point that has more to scroll to. */
function listAt(x: number, y: number): HTMLElement | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof HTMLElement)) continue;
    const { overflowY } = getComputedStyle(element);
    const scrolls = overflowY === "auto" || overflowY === "scroll";
    if (scrolls && element.scrollHeight > element.clientHeight) return element;
  }
  return undefined;
}

/**
 * While a drag lasts, from the press at `from`, scrolls the list under the pointer as the pointer nears its top or
 * bottom edge.
 */
export function useEdgeScroll(from: { x: number; y: number } | undefined): void {
  useEffect(() => {
    if (!from) return undefined;
    let pointer = from;
    const toward = { up: false, down: false };
    const follow = (event: PointerEvent) => {
      if (event.clientY < pointer.y) toward.up = true;
      if (event.clientY > pointer.y) toward.down = true;
      pointer = { x: event.clientX, y: event.clientY };
    };
    // The part of a pixel not scrolled yet, carried to the next frame.
    let carried = 0;
    let last = performance.now();
    const step = (now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      const list = listAt(pointer.x, pointer.y);
      const speed = list ? edgeSpeed(list.getBoundingClientRect(), pointer.y, toward) : 0;
      if (list && speed !== 0) {
        carried += speed * seconds;
        const whole = Math.trunc(carried);
        carried -= whole;
        if (whole !== 0) list.scrollTop = Math.round(list.scrollTop) + whole;
      } else carried = 0;
      frame = requestAnimationFrame(step);
    };
    let frame = requestAnimationFrame(step);
    window.addEventListener("pointermove", follow);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", follow);
    };
  }, [from]);
}
