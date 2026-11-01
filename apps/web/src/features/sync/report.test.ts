// What a batch report says and retries (FR-13.4, FR-13.5, DS-84, DS-107).

import { describe, expect, test } from "bun:test";

import type { BatchReport, SaveState } from "@/client/sync/save-states";

import {
  failure,
  uuidv7,
  type Container,
  type Mutation,
  type Outcome,
  type OutcomeStatus,
} from "@tonaris/domain";

import type { Names } from "./describe";
import { grouped, reasonForState, retryTargets, summarize, unsaved, underway } from "./report";

const create = (name: string, kind: Container["kind"] = "list", parentId: string | null = null) =>
  ({
    mutationId: uuidv7(),
    name: "container.create",
    args: { id: uuidv7(), kind, parentId, name },
  }) satisfies Mutation;

const item = (
  mutation: Mutation,
  outcome?: Outcome,
  status: OutcomeStatus | undefined = outcome?.status,
): SaveState => ({
  mutation,
  key: mutation.mutationId,
  status: status ?? "pending",
  since: 0,
  ...(outcome ? { outcome } : {}),
});

const report = (...items: SaveState[]): BatchReport => ({
  id: uuidv7(),
  since: 0,
  items,
  kept: true,
});

const names: Names = { album: () => undefined, container: () => undefined };
const confirmed: Outcome = { status: "confirmed", seq: 1, result: null };
const taken = failure(
  "name_conflict",
  "'Later' already exists at the top level. Choose another name.",
);
const skippedFor = (prerequisite: Mutation, because: "failed" | "skipped" = "failed"): Outcome => ({
  status: "skipped",
  dependsOn: prerequisite.mutationId,
  because,
});

const ids = (states: SaveState[]) => states.map((state) => state.mutation.mutationId);

describe("batch reports (DS-84)", () => {
  test("items are grouped in DS-84's order, with conflicts under Needs you, and the summary leads with what saved", () => {
    const folder = create("Later", "folder");
    const inside = create("Doom", "list", folder.args.id);
    const clash = create("Rename");
    const parts = report(
      item(create("Soon"), confirmed),
      item(inside, skippedFor(folder)),
      item(folder, taken),
      item(create("Queued")),
      item(clash, {
        status: "conflict",
        conflicts: [{ field: "name", current: "A", attempted: "B", base: "C" }],
      }),
      item(create("Lost"), undefined, "unconfirmed"),
      item(create("Sooner"), confirmed),
    );
    expect(grouped(parts).map(({ group, items }) => [group.title, items.length])).toEqual([
      ["Needs you", 1],
      ["Failed", 1],
      ["Skipped", 1],
      ["Waiting to confirm", 1],
      ["Saving", 1],
      ["Completed", 2],
    ]);
    expect(summarize(parts)).toBe(
      "2 saved · 1 needs you · 1 failed · 1 skipped · 1 waiting to confirm · 1 saving",
    );
    expect(underway(parts)).toBe(true);
    expect(unsaved(parts)).toHaveLength(3);
  });

  test("zero counts are left out", () => {
    const parts = report(item(create("A"), taken), item(create("B"), taken));
    expect(summarize(parts)).toBe("2 failed");
    expect(underway(parts)).toBe(false);
  });

  test("a skipped item names what it waited for, and a failure gives its reason", () => {
    const folder = create("Later", "folder");
    const inside = create("Doom", "list", folder.args.id);
    const deeper = create("Deeper", "list", inside.args.id);
    const parts = report(
      item(folder, taken),
      item(inside, skippedFor(folder)),
      item(deeper, skippedFor(inside, "skipped")),
    );
    const [failed, skipped, chained] = parts.items.map((each) =>
      reasonForState(each, names, parts),
    );
    expect(failed).toBe("'Later' already exists at the top level. Choose another name.");
    expect(skipped).toBe(
      "Waits for the folder 'Later', which couldn't be saved. Retry it to save this too.",
    );
    expect(chained).toBe("Waits for the list 'Doom', which was skipped too.");
    expect(reasonForState(item(create("Soon"), confirmed), names, parts)).toBeUndefined();
  });

  test("outside a report, a write that waits for the person says why too, as Activity shows it (TON-147)", () => {
    const conflict = {
      status: "conflict" as const,
      conflicts: [{ field: "name", current: "Soon", attempted: "Later", base: "Now" }],
    };
    expect(reasonForState(item(create("Later"), conflict), names)).toBe(
      "Changed elsewhere. Review both versions to choose.",
    );
    expect(
      reasonForState(item(create("Later"), { status: "needs_approval", approvalId: "a" }), names),
    ).toBe("Waits for your approval.");
    expect(reasonForState(item(create("Later"), taken), names)).toBe(
      "'Later' already exists at the top level. Choose another name.",
    );
  });

  test("retrying a failure takes the skips that waited for it, through chains, and never what saved", () => {
    const folder = create("Later", "folder");
    const inside = create("Doom", "list", folder.args.id);
    const deeper = create("Deeper", "list", inside.args.id);
    const other = create("Other", "folder");
    const saved = create("Soon");
    const parts = report(
      item(folder, taken),
      item(inside, skippedFor(folder)),
      item(saved, confirmed),
      item(deeper, skippedFor(inside, "skipped")),
      item(other, taken),
    );
    expect(ids(retryTargets(parts, [folder.mutationId]))).toEqual([
      folder.mutationId,
      inside.mutationId,
      deeper.mutationId,
    ]);
    expect(ids(retryTargets(parts, [other.mutationId, saved.mutationId]))).toEqual([
      other.mutationId,
    ]);
  });
});
