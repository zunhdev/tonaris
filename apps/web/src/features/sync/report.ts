// What a BatchOutcomeReport says (FR-13.4, DS-84, DS-107): its items grouped by status, in DS-84's order, its
// summary sentence, each item's reason, and what a retry makes again. A conflict needs a decision, so it is grouped
// under Needs you (DS-108). An item skipped because of an earlier one says which, and retrying that one brings the
// items that waited for it along; completed items are never made again (FR-13.5).

import {
  isUnderway,
  needsPerson,
  type BatchReport,
  type SaveState,
} from "@/client/sync/save-states";
import { needReason } from "@/features/capture/outcomes";

import type { OutcomeStatus } from "@tonaris/domain";

import { describeWrite, reasonOf, type Names } from "./describe";

export type Group = {
  title: string;
  statuses: readonly OutcomeStatus[];
  /** The group's count in the summary sentence: "3 saved". */
  counted: (n: number) => string;
};

/** The report's groups, in the order shown (DS-84). */
export const groups: readonly Group[] = [
  {
    title: "Needs you",
    statuses: ["conflict", "needs_input", "needs_approval"],
    counted: (n) => `${n} need${n === 1 ? "s" : ""} you`,
  },
  { title: "Failed", statuses: ["failed"], counted: (n) => `${n} failed` },
  { title: "Skipped", statuses: ["skipped"], counted: (n) => `${n} skipped` },
  {
    title: "Waiting to confirm",
    statuses: ["unconfirmed"],
    counted: (n) => `${n} waiting to confirm`,
  },
  { title: "Saving", statuses: ["pending"], counted: (n) => `${n} saving` },
  { title: "Completed", statuses: ["confirmed"], counted: (n) => `${n} saved` },
];

/** The report's groups that have items, in order, each with its items in the order they were made. */
export function grouped(report: BatchReport): { group: Group; items: SaveState[] }[] {
  return groups.flatMap((group) => {
    const items = report.items.filter((item) => group.statuses.includes(item.status));
    return items.length > 0 ? [{ group, items }] : [];
  });
}

/** The header's summary sentence (DS-84): what saved first, then each other status, zero counts left out. */
export function summarize(report: BatchReport): string {
  const counts = grouped(report);
  const saved = counts.filter(({ group }) => group.title === "Completed");
  return [...saved, ...counts.filter((each) => !saved.includes(each))]
    .map(({ group, items }) => group.counted(items.length))
    .join(" · ");
}

/** Whether any item is still on its way: queued, in flight, or unconfirmed. */
export function underway(report: BatchReport): boolean {
  return report.items.some((item) => isUnderway(item.status));
}

/** The items that settled without being saved: failed, skipped, or needing the person. */
export function unsaved(report: BatchReport): SaveState[] {
  return report.items.filter((item) => needsPerson(item.status));
}

const waitedFor: Partial<Record<OutcomeStatus, string>> = {
  failed: "couldn't be saved. Retry it to save this too.",
  conflict: "changed elsewhere. Review it first.",
  skipped: "was skipped too.",
  needs_input: "needs your choice.",
  needs_approval: "waits for your approval.",
  pending: "is still being saved.",
};

/**
 * Why a write isn't saved, in words (DS-107), in Activity and in its batch `report`; nothing for one saved or still on
 * its way. Only a batch's writes are skipped, each naming the write it waited for.
 */
export function reasonForState(
  state: SaveState,
  names: Names,
  report?: BatchReport,
): string | undefined {
  const { outcome } = state;
  if (outcome?.status === "failed") return reasonOf(outcome);
  if (outcome?.status === "conflict") return "Changed elsewhere. Review both versions to choose.";
  if (outcome?.status === "needs_input") return needReason(outcome) ?? "Needs your choice.";
  if (outcome?.status === "needs_approval") return "Waits for your approval.";
  if (outcome?.status !== "skipped") return undefined;
  const prerequisite = report?.items.find((each) => each.mutation.mutationId === outcome.dependsOn);
  if (!prerequisite) return "Waits for an earlier change that wasn't saved.";
  const { what } = describeWrite(prerequisite.mutation, names);
  return `Waits for ${what}, which ${waitedFor[outcome.because] ?? "wasn't saved."}`;
}

/** The items Retry all retries: every failure (DS-84). */
export function retryable(report: BatchReport): SaveState[] {
  return report.items.filter((item) => item.status === "failed");
}

/**
 * What retrying the failed items `ids` makes again, in the report's order: those items, and every item skipped
 * because of them, through chains of skips. Nothing completed is ever included (FR-13.5).
 */
export function retryTargets(report: BatchReport, ids: readonly string[]): SaveState[] {
  const chosen = new Set(
    report.items
      .filter((item) => item.status === "failed" && ids.includes(item.mutation.mutationId))
      .map((item) => item.mutation.mutationId),
  );
  // Each pass takes in the skips that waited for something already taken, until none is left.
  for (let grew = true; grew;) {
    grew = false;
    for (const { mutation, outcome } of report.items) {
      if (outcome?.status !== "skipped" || chosen.has(mutation.mutationId)) continue;
      if (!chosen.has(outcome.dependsOn)) continue;
      chosen.add(mutation.mutationId);
      grew = true;
    }
  }
  return report.items.filter((item) => chosen.has(item.mutation.mutationId));
}
