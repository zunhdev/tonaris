// Placeholder rows (DS-48; FR-02.5, FR-02.10): the captures going to a list, or to Unsorted, shown at the top of that
// view while they aren't saved. The album's place isn't known until it is identified, so its row waits at the top,
// whatever the sort, and the album takes its place in the view once saved. A pending capture reads "Resolving link…";
// a failed one keeps its link with the reason, Retry, Enter manually and Dismiss; one asking for the album's details
// offers Enter manually; one fitting several albums shows the decision card. The rows are this browser's captures,
// kept across reloads like any write.

import type { SaveState } from "@/client/sync/writer";
import { reasonOf } from "@/features/sync/describe";
import { useSaveActions } from "@/features/sync/save-actions";
import { useOpenStates } from "@/features/sync/save-states";
import { useConnection } from "@/features/sync/sync-provider";
import { useMemo } from "react";

import { Button } from "@tonaris/ui/components/button";

import { DecisionCard } from "./decision-card";
import { captureNeed, needReason, shownLink } from "./outcomes";

const placeholder = new Set(["pending", "unconfirmed", "failed", "needs_input"]);

/** This browser's captures going to `listId`, or to Unsorted for null, that aren't saved yet, oldest first. */
export function usePlaceholders(listId: string | null): SaveState[] {
  const open = useOpenStates();
  return useMemo(
    () =>
      open.filter(
        (state) =>
          state.mutation.name === "album.capture" &&
          state.mutation.args.listId === listId &&
          placeholder.has(state.status),
      ),
    [open, listId],
  );
}

export function CaptureRows({ listId }: { listId: string | null }) {
  const captures = usePlaceholders(listId);
  if (captures.length === 0) return null;
  return (
    <section
      aria-label="Albums being added"
      data-slot="capture-rows"
      className="flex max-h-[40%] shrink-0 flex-col overflow-y-auto border-b border-subtle"
    >
      <ul className="flex flex-col">
        {captures.map((state) => (
          <CaptureRow key={state.mutation.mutationId} state={state} />
        ))}
      </ul>
    </section>
  );
}

function CaptureRow({ state }: { state: SaveState }) {
  const actions = useSaveActions();
  const offline = useConnection() === "offline";
  if (state.mutation.name !== "album.capture") return null;
  const { link } = state.mutation.args;
  const underway = state.status === "pending" || state.status === "unconfirmed";
  const failed = state.status === "failed";
  const need = captureNeed(state.outcome);
  const reason = failed ? reasonOf(state.outcome) : needReason(state.outcome);
  return (
    <li
      aria-busy={underway || undefined}
      data-status={state.status}
      className="flex items-start gap-3 px-4 py-2"
    >
      <span aria-hidden className="mt-0.5 size-7 shrink-0 animate-pulse rounded-sm bg-raised" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-fg-primary" title={link}>
          {shownLink(link)}
        </p>
        {underway ? (
          <p className="text-small text-fg-secondary">
            {state.status === "unconfirmed" ? "Waiting for an answer…" : "Resolving link…"}
          </p>
        ) : (
          reason !== undefined && (
            <p
              className={failed ? "text-small text-status-danger" : "text-small text-fg-secondary"}
            >
              {reason}
            </p>
          )
        )}
        {need?.need === "match" && <DecisionCard state={state} />}
        {actions && (failed || need !== undefined) && (
          <div className="flex flex-wrap gap-2">
            {failed && (
              <Button size="sm" disabled={offline} onClick={() => actions.resubmit(state)}>
                Retry
              </Button>
            )}
            {need?.need !== "match" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={offline}
                onClick={() => actions.edit(state)}
              >
                Enter manually
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => actions.dismiss(state)}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
