// The SyncIndicator (DS-29, DS-81) in the sidebar footer: a dot and a label for the connection and the saves, and
// Activity, the popover it opens, listing every change not saved yet with its next step (FR-09.3), and the batch
// reports, which hold the changes made together (DS-84). Activity can also be opened at a report, from its toast.
// Its label follows the first that applies:
// offline, reconnecting, changes waiting to confirm, changes needing review, a save pending for 300 ms (DS-80).
// Up to date, it shows the dot alone, and says so in its accessible name and tooltip (DS-115). The count of
// changes needing review keeps failures and conflicts in view once their toasts are closed (DS-02).

import type { BatchReport, SaveState } from "@/client/sync/writer";
import { DecisionCard } from "@/features/capture/decision-card";
import { captureNeed, needReason } from "@/features/capture/outcomes";

import { Button } from "@tonaris/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@tonaris/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";
import { cn } from "@tonaris/ui/lib/utils";

import { useActivity } from "./activity";
import { BatchOutcomeReport } from "./batch-report";
import { describeWrite, reasonOf, statusLabels } from "./describe";
import { namesOf, useSaveActions } from "./save-actions";
import { SaveStateMarker } from "./save-state-marker";
import { useDelayed, useOpenStates, useReports } from "./save-states";
import { useConnection, useSyncClient } from "./sync-provider";

const dots = {
  neutral: "bg-fg-tertiary",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
};

const changes = (n: number) => (n === 1 ? "1 change" : `${n} changes`);

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
  const review = open.filter(
    (state) => state.status !== "pending" && state.status !== "unconfirmed",
  ).length;

  let tone: keyof typeof dots = "neutral";
  let label: string | undefined;
  if (connection === "offline") [tone, label] = ["danger", "Offline — changes can't be saved"];
  else if (connection === "reconnecting") [tone, label] = ["warning", "Reconnecting…"];
  else if (unconfirmed > 0) label = `${changes(unconfirmed)} waiting to confirm`;
  else if (review > 0)
    [tone, label] = ["warning", `${review} need${review === 1 ? "s" : ""} review`];
  else if (saving) label = "Saving…";
  const quiet = connection === "connecting" ? "Connecting…" : "Up to date";

  const trigger = (
    <PopoverTrigger
      // A long label wraps rather than hiding its end: "Offline — changes can't be saved".
      render={
        <Button
          variant="ghost"
          className="h-auto min-h-7 w-full justify-start py-1 text-left whitespace-normal"
        />
      }
      aria-label={`Sync status: ${label ?? quiet}`}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dots[tone])} />
      {label && <span className="min-w-0">{label}</span>}
    </PopoverTrigger>
  );

  return (
    <Popover open={activity.open} onOpenChange={activity.setOpen}>
      {label ? (
        trigger
      ) : (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent side="right">{quiet}</TooltipContent>
        </Tooltip>
      )}
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
              <ActivityItem key={entry.state.mutation.mutationId} state={entry.state} />
            ),
          )}
        </ul>
      )}
    </>
  );
}

function ActivityItem({ state }: { state: SaveState }) {
  const client = useSyncClient();
  const actions = useSaveActions();
  if (!client) return null;
  const { summary } = describeWrite(state.mutation, namesOf(client));
  const failed = state.status === "failed";
  // A capture waiting for the person: a choice, or the album's details (DS-48).
  const need = captureNeed(state.outcome);
  const reason = failed ? reasonOf(state.outcome) : needReason(state.outcome);
  return (
    <li className="flex items-start gap-2 rounded-md py-1" data-status={state.status}>
      <span className="mt-1">
        <SaveStateMarker status={state.status} delayed={false} labelled={false} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-fg-primary">{summary}</p>
        <p className="text-small text-fg-secondary">
          {statusLabels[state.status]}
          {reason !== undefined && `: ${reason}`}
        </p>
        {actions && need?.need === "match" && <DecisionCard state={state} folded />}
        {actions && (failed || need !== undefined || state.status === "conflict") && (
          <div className="mt-1 flex gap-2">
            {failed || need !== undefined ? (
              <>
                {failed && (
                  <Button size="sm" onClick={() => actions.resubmit(state)}>
                    Retry
                  </Button>
                )}
                {actions.canEdit(state) && need?.need !== "match" && (
                  <Button size="sm" variant="secondary" onClick={() => actions.edit(state)}>
                    {actions.editLabel(state)}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => actions.dismiss(state)}>
                  Dismiss
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => actions.review(state.mutation.mutationId)}>
                Review
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
