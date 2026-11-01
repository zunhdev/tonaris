// One write as Activity and a batch report list it (DS-81, DS-84): its marker, its summary, why it isn't saved, and
// its next actions. Retry for a failure; Edit, or Enter manually for a capture, where it can be edited; the decision
// card for a capture that fits several albums (DS-48); Review for a conflict. Activity also says each write's state,
// and has Dismiss for a failure or a choice; a report keeps its writes until the report is dismissed, and checks
// those saved.

import type { BatchReport, SaveState } from "@/client/sync/save-states";
import { DecisionCard } from "@/features/capture/decision-card";
import { captureNeed } from "@/features/capture/outcomes";

import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

import { describeWrite, goneReason, statusLabels } from "./describe";
import { reasonForState } from "./report";
import { namesOf, useSaveActions } from "./save-actions";
import { SaveStateMarker } from "./save-state-marker";
import { useSyncClient } from "./sync-provider";

export function SaveStateItem({
  state,
  report,
  gone = false,
  onRetry,
}: {
  state: SaveState;
  /** The batch report it is listed in; Activity lists it on its own. */
  report?: BatchReport;
  /** Retrying it found its record gone. */
  gone?: boolean;
  /** Retry, for a failure; without it there is none. */
  onRetry?: () => void;
}) {
  const client = useSyncClient();
  const actions = useSaveActions();
  if (!client) return null;
  const names = namesOf(client);
  const { summary } = describeWrite(state.mutation, names);
  const failed = state.status === "failed";
  // A capture waiting for the person: a choice, or the album's details (DS-48).
  const need = captureNeed(state.outcome);
  const reason = gone ? goneReason : reasonForState(state, names, report);
  const retry = failed && !gone && onRetry !== undefined;
  const edit =
    actions !== undefined &&
    ((failed && !gone) || need?.need === "details") &&
    actions.canEdit(state);
  const dismiss = report === undefined && (failed || need !== undefined);
  const review = state.status === "conflict";
  return (
    <li
      className={cn("flex items-start gap-2 py-1", report === undefined && "rounded-md")}
      data-status={state.status}
    >
      <span className="mt-1">
        <SaveStateMarker
          status={state.status}
          delayed={false}
          labelled={false}
          showSaved={report !== undefined}
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-fg-primary">{summary}</p>
        {report === undefined ? (
          <p className="text-small text-fg-secondary">
            {statusLabels[state.status]}
            {reason !== undefined && `: ${reason}`}
          </p>
        ) : (
          reason && <p className="text-small text-fg-secondary">{reason}</p>
        )}
        {actions && need?.need === "match" && <DecisionCard state={state} folded />}
        {actions && (retry || edit || dismiss || review) && (
          <div className="mt-1 flex gap-2">
            {retry && (
              <Button size="sm" onClick={onRetry}>
                Retry
              </Button>
            )}
            {edit && (
              <Button size="sm" variant="secondary" onClick={() => actions.edit(state)}>
                {actions.editLabel(state)}
              </Button>
            )}
            {dismiss && (
              <Button size="sm" variant="ghost" onClick={() => actions.dismiss(state)}>
                Dismiss
              </Button>
            )}
            {review && (
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
