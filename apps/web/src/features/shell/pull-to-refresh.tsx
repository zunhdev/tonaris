// Pull to refresh in an iPhone Home Screen app (TON-139, DS-110). iOS gives such apps no browser toolbar and no pull
// to refresh of its own, so pulling down at the top of a view did nothing, while Android's installed app reloads.
// Here, a finger pulling down from the top of a view brings a spinner after it, and letting go past the threshold
// reloads the page, as Android does. Only there: Safari and Android keep their own. A touch in a dialog, the album
// sheet or a field, or on a view scrolled away from its top, pulls nothing.

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { pullDistance, pullProgress, pullThreshold } from "./pull";

/** Whether this is an iPhone's Home Screen app: only iOS sets `navigator.standalone`, and only there. */
function homeScreenApp(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Whether a touch starting at `target` may pull: outside dialogs, the album sheet and fields, at its view's top. */
function mayPull(target: Element): boolean {
  if (target.closest('[role="dialog"], [role="alertdialog"], [role="complementary"]')) return false;
  if (target.closest("input, textarea, select, [contenteditable]")) return false;
  for (let element: Element | null = target; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    const scrolls =
      (overflowY === "auto" || overflowY === "scroll") &&
      element.scrollHeight > element.clientHeight;
    if (scrolls) return element.scrollTop <= 0;
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

export function PullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!homeScreenApp()) return () => {};
    let startY: number | undefined;
    let pulled = 0;
    const start = (event: TouchEvent) => {
      const [touch] = event.touches;
      const pulls =
        event.touches.length === 1 && event.target instanceof Element && mayPull(event.target);
      startY = pulls ? touch?.clientY : undefined;
      pulled = 0;
    };
    const move = (event: TouchEvent) => {
      const [touch] = event.touches;
      if (startY === undefined || !touch) return;
      pulled = pullDistance(touch.clientY - startY);
      setDistance(pulled);
    };
    const end = () => {
      if (startY === undefined) return;
      startY = undefined;
      if (pulled < pullThreshold) {
        setDistance(0);
        return;
      }
      setDistance(pullThreshold);
      setReloading(true);
      location.reload();
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, []);

  if (distance === 0 && !reloading) return null;
  const progress = pullProgress(distance);
  return (
    <div
      aria-hidden
      data-slot="pull-to-refresh"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      // Below the top bar, following the finger.
      style={{ top: `calc(env(safe-area-inset-top) + 2.5rem + ${distance}px)` }}
    >
      <span
        className="flex size-9 items-center justify-center rounded-full bg-raised shadow-floating"
        style={{ opacity: Math.max(progress, 0.2) }}
      >
        <RefreshCw
          strokeWidth={1.5}
          className={cn("size-4 text-fg-secondary", reloading && "animate-spin")}
          style={reloading ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </span>
    </div>
  );
}
