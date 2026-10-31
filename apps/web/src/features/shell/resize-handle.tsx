// A pane's resizable edge (DS-30): a focusable window splitter, dragged or moved with ← and → (16 px a step), Home
// and End. Its value is the pane's width. The sidebar's is its right edge; the album inspector's is its left edge
// (TON-124), where ← widens it.

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { clampWidth, type Widths } from "./device";

const step = 16;

export function ResizeHandle({
  label,
  edge,
  width,
  widths,
  onResize,
}: {
  label: string;
  /** Which edge of its pane it is: the pane widens as it moves away from the pane. */
  edge: "left" | "right";
  width: number;
  widths: Widths;
  onResize: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | undefined>(undefined);
  const outward = edge === "right" ? 1 : -1;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = {
      ArrowLeft: width - step * outward,
      ArrowRight: width + step * outward,
      Home: widths.min,
      End: widths.max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onResize(clampWidth(next, widths));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    onResize(clampWidth(drag.current.width + (event.clientX - drag.current.x) * outward, widths));
  }

  // A focusable window splitter, which an `hr` can't be.
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={widths.min}
      aria-valuemax={widths.max}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        drag.current = undefined;
      }}
      className={cn(
        "absolute top-0 bottom-0 z-10 w-2 cursor-col-resize outline-none hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus focus-visible:outline-solid",
        edge === "right" ? "-right-1" : "-left-1",
      )}
    />
  );
}
