// The BatchOutcomeReport (DS-29, DS-84; FR-13.4): one action's writes, reported together in Activity. Its header is
// the summary sentence and folds the report; the groups follow in DS-84's order, each item with its reason and next
// action: Retry for a failure, which brings the items that waited for it along, Review for a conflict, and for a
// capture, Enter manually or the decision card's Decide (DS-48). Retry all
// appears for two or more failures, and Dismiss once the report is kept. Completed items are folded away, since a
// batch holds up to 200. Status is told by the group's heading and each item's icon, never by color only (DS-115).

import type { BatchReport, SaveState } from "@/client/sync/save-states";
import { ChevronRight } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@tonaris/ui/components/button";
import { cn } from "@tonaris/ui/lib/utils";

import { grouped, retryable, summarize } from "./report";
import { useSaveActions } from "./save-actions";
import { SaveStateItem } from "./save-state-item";

const disclosure =
  "flex min-w-0 items-start gap-1 rounded-sm text-left outline-none hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus";

export function BatchOutcomeReport({ report }: { report: BatchReport }) {
  const actions = useSaveActions();
  const [expanded, setExpanded] = useState(true);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const header = useRef<HTMLButtonElement>(null);
  const id = useId();
  const failures = retryable(report);

  function retry(ids: readonly string[]) {
    if (!actions) return;
    const targets = actions.retry(report, ids);
    const lost = ids.filter((_, index) => targets[index] === "gone");
    if (lost.length > 0) setGone(new Set([...gone, ...lost]));
    // The items move to another group, taking their buttons with them.
    header.current?.focus();
  }

  return (
    <section
      aria-labelledby={`${id}-summary`}
      data-slot="batch-report"
      className="flex flex-col gap-1.5 rounded-md border border-subtle p-2"
    >
      <div className="flex items-start gap-2">
        <button
          ref={header}
          id={`${id}-summary`}
          type="button"
          data-report={report.id}
          aria-expanded={expanded}
          aria-controls={`${id}-groups`}
          onClick={() => setExpanded(!expanded)}
          className={cn(disclosure, "flex-1 font-medium text-fg-primary")}
        >
          <ChevronRight
            strokeWidth={1.5}
            aria-hidden
            className={cn("mt-0.5 size-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
          />
          <span>{summarize(report)}</span>
        </button>
      </div>
      {actions && (failures.length >= 2 || report.kept) && (
        <div className="flex gap-2 pl-4.5">
          {failures.length >= 2 && (
            <Button
              size="sm"
              onClick={() => retry(failures.map((item) => item.mutation.mutationId))}
            >
              Retry all
            </Button>
          )}
          {report.kept && (
            <Button size="sm" variant="ghost" onClick={() => actions.dismissReport(report)}>
              Dismiss
            </Button>
          )}
        </div>
      )}
      {expanded && (
        <div id={`${id}-groups`} className="flex flex-col gap-2 pl-4.5">
          {grouped(report).map(({ group, items }, index) =>
            group.title === "Completed" ? (
              <Completed key={group.title} report={report} items={items} />
            ) : (
              <div key={group.title}>
                <h3
                  id={`${id}-group-${index}`}
                  className="text-small font-medium text-fg-secondary"
                >
                  {group.title} ({items.length})
                </h3>
                <ul aria-labelledby={`${id}-group-${index}`} className="flex flex-col">
                  {items.map((item) => (
                    <SaveStateItem
                      key={item.mutation.mutationId}
                      state={item}
                      report={report}
                      gone={gone.has(item.mutation.mutationId)}
                      onRetry={() => retry([item.mutation.mutationId])}
                    />
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** The completed items, folded away by default: there can be nearly 200. */
function Completed({ report, items }: { report: BatchReport; items: SaveState[] }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div>
      <h3 className="text-small font-medium text-fg-secondary">
        <button
          type="button"
          aria-expanded={shown}
          aria-controls={id}
          onClick={() => setShown(!shown)}
          className={disclosure}
        >
          <ChevronRight
            strokeWidth={1.5}
            aria-hidden
            className={cn("mt-0.5 size-3 shrink-0 transition-transform", shown && "rotate-90")}
          />
          Completed ({items.length})
        </button>
      </h3>
      {shown && (
        <ul id={id} className="flex flex-col">
          {items.map((item) => (
            <SaveStateItem key={item.mutation.mutationId} state={item} report={report} />
          ))}
        </ul>
      )}
    </div>
  );
}
