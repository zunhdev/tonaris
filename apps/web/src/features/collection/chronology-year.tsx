// The year in an album row or card (DS-24): the original year, a live recording year or range after a small `rec.`,
// or, for a live album whose recording year is unknown, its release year with a fallback marker. The marker's
// tooltip says why, and so does hidden text, since a tooltip never carries information alone (DS-115).

import { CalendarClock } from "lucide-react";

import type { Album } from "@tonaris/domain";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";

import { chronology } from "./order";

const fallbackText = "Recording year unknown — sorted by release year";

export function ChronologyYear({
  album,
}: {
  album: Pick<Album, "isLive" | "originalYear" | "recordingYearStart" | "recordingYearEnd">;
}) {
  const { year, recorded, fallback } = chronology(album);
  return (
    <span className="inline-flex min-w-0 items-center gap-1 tabular-nums">
      {/* The spaces are for the text read aloud; the gap spaces the layout. */}
      {recorded && <span className="text-small text-fg-tertiary">rec.</span>}{" "}
      <span className="truncate">{year}</span>{" "}
      {fallback && (
        <Tooltip>
          <TooltipTrigger
            render={<span className="inline-flex items-center gap-1 text-fg-tertiary" />}
          >
            <span aria-hidden>·</span>{" "}
            <CalendarClock aria-hidden strokeWidth={1.5} className="size-3.5" />
            <span className="sr-only">{fallbackText}</span>
          </TooltipTrigger>
          <TooltipContent>{fallbackText}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
