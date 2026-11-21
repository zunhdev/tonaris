// The SyncIndicator (DS-29, DS-81) in the sidebar footer: the Activity row, which opens Activity, the popover listing
// every change not saved yet with its next step (FR-09.3), and the batch reports, which hold the changes made together
// (DS-84). Activity can also be opened at a report, from its toast.
// Drawn as Search and Add album are, the row is an icon and "Activity", with its state at the right only when there is
// one (TON-291), the first that applies: changes waiting to confirm, changes needing review, a save pending for 300 ms
// (DS-80), or else the reports Activity holds, as a count. Reconnecting or offline takes over the row. Its accessible
// name starts with its visible label and says the whole state, as its tooltip does when the row shortens it (DS-115).
// The count of changes needing review keeps failures and conflicts in view once their toasts are closed (DS-02).

import { needsPerson, type BatchReport, type SaveState } from "@/client/sync/save-states";
import { LearnMore } from "@/features/help/links";
import { CloudOff, CloudSync, History, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@tonaris/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@tonaris/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";

import { useActivity } from "./activity";
import { BatchOutcomeReport } from "./batch-report";
import { changes } from "./describe";
import { useSaveActions } from "./save-actions";
import { SaveStateItem } from "./save-state-item";
import { useDelayed, useOpenStates, useReports } from "./save-states";
import { useConnection } from "./sync-provider";

const aside = "ml-auto flex shrink-0 items-center gap-1 text-small whitespace-nowrap";

export function SyncIndicator() {
  const connection = useConnection();
  const open = useOpenStates();
  const reports = useReports();
  const activity = useActivity();
  const saving = useDelayed(
    open.some((state) => state.status === "pending"),
    300,
  );
  const unconfirmed = open.filter((state) => state.status === "unconfirmed").length;
  // Failed, in conflict, skipped, or needing a choice: settled, but not saved.
  const review = open.filter((state) => needsPerson(state.status)).length;

  // The whole state, said by the accessible name and the tooltip; what the row shows of it; and whether that is all.
  let state: string;
  let shown: ReactNode = null;
  let whole = false;
  if (connection === "offline" || connection === "reconnecting") {
    const offline = connection === "offline";
    state = offline ? "Offline — changes can't be saved" : "Reconnecting…";
    const Icon = offline ? CloudOff : CloudSync;
    shown = (
      <>
        <Icon
          strokeWidth={1.5}
          aria-hidden
          className={offline ? "text-status-danger" : "text-status-warning"}
        />
        {/* A long state wraps rather than hiding its end. */}
        <span className="min-w-0">{state}</span>
      </>
    );
    whole = true;
  } else {
    let right: ReactNode = null;
    if (unconfirmed > 0) {
      state = `${changes(unconfirmed)} waiting to confirm`;
      right = <span className={`${aside} text-fg-tertiary`}>{unconfirmed} waiting</span>;
    } else if (review > 0) {
      state = `${review} need${review === 1 ? "s" : ""} review`;
      right = <span className={`${aside} text-status-warning`}>{state}</span>;
      whole = true;
    } else if (saving) {
      state = "Saving…";
      right = (
        <span className={`${aside} text-fg-tertiary`}>
          <LoaderCircle strokeWidth={1.5} aria-hidden className="size-3 motion-safe:animate-spin" />
          {state}
        </span>
      );
      whole = true;
    } else {
      state = connection === "connecting" ? "Connecting…" : "Up to date";
      if (reports.length > 0) {
        state += `, ${reports.length} report${reports.length === 1 ? "" : "s"}`;
        right = (
          <span className="ml-auto shrink-0 text-small font-normal text-fg-tertiary tabular-nums">
            {reports.length}
          </span>
        );
      }
    }
    shown = (
      <>
        <History strokeWidth={1.5} aria-hidden />
        Activity
        {right}
      </>
    );
  }

  const trigger = (
    <PopoverTrigger
      render={
        <Button
          variant="ghost"
          className="h-auto min-h-7 w-full justify-start py-0.5 text-left whitespace-normal"
        />
      }
      aria-label={`Activity: ${state}`}
    >
      {shown}
    </PopoverTrigger>
  );

  return (
    <Popover open={activity.open} onOpenChange={activity.setOpen}>
      {/* One tooltip, off while the row shows the whole state, so a new state never remounts the button. */}
      <Tooltip disabled={whole}>
        <TooltipTrigger render={trigger} />
        <TooltipContent side="right">{state}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="start"
        className="max-h-[min(70vh,var(--available-height))] w-96"
        // Opened at a report, its header takes the focus, which also brings it into view.
        initialFocus={() =>
          (activity.report &&
            document.querySelector<HTMLElement>(`[data-report="${activity.report}"]`)) ||
          true
        }
      >
        <Activity open={open} reports={reports} connected={connection === "connected"} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Every change not saved yet and every open batch report, oldest first (DS-81, DS-84). A change made with others is
 * in its batch's report rather than on its own.
 */
function Activity({
  open,
  reports,
  connected,
}: {
  open: readonly SaveState[];
  reports: readonly BatchReport[];
  connected: boolean;
}) {
  const actions = useSaveActions();
  const entries = [
    ...reports.map((report) => ({ since: report.since, report })),
    ...open.flatMap((state) => (state.batch === undefined ? [{ since: state.since, state }] : [])),
  ].toSorted((a, b) => a.since - b.since);
  return (
    <>
      <PopoverTitle>Activity</PopoverTitle>
      {entries.length === 0 ? (
        <p className="mt-1 text-fg-secondary">
          {connected ? "All changes are saved." : "Nothing is waiting to be saved."}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {entries.map((entry) =>
            "report" in entry ? (
              <li key={entry.report.id}>
                <BatchOutcomeReport report={entry.report} />
              </li>
            ) : (
              <SaveStateItem
                key={entry.state.mutation.mutationId}
                state={entry.state}
                onRetry={() => actions?.resubmit(entry.state)}
              />
            ),
          )}
        </ul>
      )}
      {entries.length > 0 && (
        <p className="mt-2 text-small text-fg-secondary">
          <LearnMore page="saving/when-an-edit-doesnt-save" about="changes that weren't saved" />
        </p>
      )}
    </>
  );
}
