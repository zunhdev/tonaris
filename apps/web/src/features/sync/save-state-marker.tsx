// The SaveStateMarker (DS-29, DS-80): a record's save state in the trailing slot of its row, as a 12px icon with
// its state in words for screen readers, so it is never color only (DS-115). A pending save shows only after
// 300 ms, and its spinner holds still under reduced motion. Confirmed records show nothing (DS-02), except in a
// batch report, where completed items show a check (DS-84).

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CloudOff,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { OutcomeStatus } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { statusLabels } from "./describe";

const markers: Partial<Record<OutcomeStatus, { icon: LucideIcon; className: string }>> = {
  pending: { icon: LoaderCircle, className: "text-fg-tertiary motion-safe:animate-spin" },
  unconfirmed: { icon: CloudOff, className: "text-fg-secondary" },
  failed: { icon: CircleAlert, className: "text-status-danger" },
  conflict: { icon: TriangleAlert, className: "text-status-warning" },
  skipped: { icon: CircleDashed, className: "text-fg-tertiary" },
  needs_input: { icon: CircleHelp, className: "text-status-warning" },
  needs_approval: { icon: CircleHelp, className: "text-status-warning" },
};

const saved = { icon: CircleCheck, className: "text-status-success" };

export function SaveStateMarker({
  status,
  delayed = true,
  labelled = true,
  showSaved = false,
}: {
  status: OutcomeStatus | undefined;
  /** Whether a pending save waits 300 ms before showing; Activity shows it at once. */
  delayed?: boolean;
  /** Whether the state is also said in words; off where the words are already beside it. */
  labelled?: boolean;
  /** Whether a confirmed write shows its check, as in a batch report. */
  showSaved?: boolean;
}) {
  const marker = status === "confirmed" && showSaved ? saved : status && markers[status];
  if (!status || !marker) return null;
  const Icon = marker.icon;
  return (
    <span
      data-slot="save-state"
      data-status={status}
      className={cn(
        "inline-flex size-3 shrink-0 items-center",
        delayed && status === "pending" && "save-state-delayed",
      )}
    >
      <Icon strokeWidth={1.5} className={cn("size-3", marker.className)} aria-hidden />
      {labelled && <span className="sr-only">{statusLabels[status]}</span>}
    </span>
  );
}
