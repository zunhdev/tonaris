// The capture panel (DS-48, FR-02.11): bottom right, while a batch of captures is underway, it says how far it got,
// "Adding 12 · 8 done · 2 need you · 1 failed", and opens the batch's report in Activity, where each item has its
// actions (DS-84). Once nothing is underway it goes: the report, and its toast if anything wasn't saved, carry on.

import type { BatchReport } from "@/client/sync/save-states";
import { useActivity } from "@/features/sync/activity";
import { underway } from "@/features/sync/report";
import { useReports } from "@/features/sync/save-states";

/** What the panel says of a batch of captures (DS-48). */
export function captureProgress(report: BatchReport): string {
  const count = (statuses: readonly string[]) =>
    report.items.filter((item) => statuses.includes(item.status)).length;
  const parts = [
    `Adding ${report.items.length}`,
    `${count(["confirmed"])} done`,
    ...[
      [count(["needs_input", "conflict", "needs_approval"]), "need you"] as const,
      [count(["failed", "skipped"]), "failed"] as const,
    ].flatMap(([n, words]) => (n > 0 ? [`${n} ${words}`] : [])),
  ];
  return parts.join(" · ");
}

/** Whether a report is a batch of captures. */
const isCapture = (report: BatchReport) =>
  report.items.length > 1 && report.items.every((item) => item.mutation.name === "album.capture");

export function CapturePanel() {
  const reports = useReports();
  const activity = useActivity();
  const running = reports.filter((report) => isCapture(report) && underway(report));
  if (running.length === 0) return null;
  return (
    <div
      data-slot="capture-panel"
      className="fixed right-4 bottom-4 z-40 flex flex-col gap-1.5 rounded-md border border-subtle bg-raised p-2 shadow-floating"
    >
      {running.map((report) => (
        <button
          key={report.id}
          type="button"
          aria-busy
          onClick={() => activity.show(report.id)}
          className="rounded-sm px-2 py-1 text-left text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
        >
          {captureProgress(report)}
        </button>
      ))}
    </div>
  );
}
