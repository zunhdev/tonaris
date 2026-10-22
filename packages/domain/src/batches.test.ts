// The batch rules (TS-25, FR-13.4) with a stub in place of the database: what is refused as a whole, what each
// item gets, and when dependents run. The database layer's tests run the same rules through executeMutation.

import { describe, expect, test } from "bun:test";

import { batchSchema, runBatch, type Batch, type BatchItem } from "./batches";
import { uuidv7 } from "./ids";
import { maxBatchItems } from "./limits";
import { failure, type Outcome } from "./outcomes";
import type { Mutation } from "./sync";

const createList = (name: string, dependsOn?: string[]): BatchItem => ({
  mutationId: uuidv7(),
  name: "container.create",
  args: { id: uuidv7(), kind: "list", parentId: null, name },
  ...(dependsOn && { dependsOn }),
});

const batch = (...items: Batch["items"]): Batch => ({ batchId: uuidv7(), items });

const confirmed: Outcome = { status: "confirmed", seq: 1, result: null };

/** A `run` that answers by list name, and records what it was given. */
function stub(answers: Record<string, Outcome> = {}) {
  const ran: Mutation[] = [];
  const run = (mutation: Mutation) => {
    ran.push(mutation);
    const name = mutation.name === "container.create" ? mutation.args.name : "";
    return Promise.resolve(answers[name] ?? confirmed);
  };
  return { ran, run };
}

/** Each item's status, or its error code when it failed. */
const statuses = (items: { outcome: Outcome }[]) =>
  items.map(({ outcome }) => (outcome.status === "failed" ? outcome.code : outcome.status));

describe("the batch frame", () => {
  test("parses a batch of items with v7 IDs", () => {
    expect(batchSchema.safeParse(batch(createList("A"), createList("B"))).success).toBe(true);
  });

  test("refuses no items, more than 200, repeated IDs and other IDs", () => {
    const item = createList("A");
    const tooMany = Array.from({ length: maxBatchItems + 1 }, () => createList("A"));
    const refused = [
      batch(),
      batch(...tooMany),
      batch(item, { ...createList("B"), mutationId: item.mutationId }),
      batch({ ...item, mutationId: crypto.randomUUID() }),
      { ...batch(item), batchId: crypto.randomUUID() },
    ];
    for (const each of refused) expect(batchSchema.safeParse(each).success).toBe(false);
    expect(batchSchema.safeParse(batch(...tooMany.slice(1))).success).toBe(true);
  });

  test("names the repeated ID's item", () => {
    const item = createList("A");
    const result = batchSchema.safeParse(batch(item, createList("B"), { ...item }));
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["items", 2, "mutationId"]]);
  });
});

describe("runBatch (TS-25, FR-13.4)", () => {
  test("keeps each item's outcome, in order, when one fails", async () => {
    const taken = failure("name_conflict", "There's already a list named B.");
    const { run, ran } = stub({ B: taken });
    const sent = batch(createList("A"), createList("B"), createList("C"));
    const result = await runBatch(sent, run);
    expect(result).toEqual({
      batchId: sent.batchId,
      items: [
        { mutationId: sent.items[0]!.mutationId, outcome: confirmed },
        { mutationId: sent.items[1]!.mutationId, outcome: taken },
        { mutationId: sent.items[2]!.mutationId, outcome: confirmed },
      ],
    });
    expect(ran).toHaveLength(3);
  });

  test("fails an invalid item on its own, with paths in the item, and runs the others", async () => {
    const { run, ran } = stub();
    const unknown = { mutationId: uuidv7(), name: "album.delete", args: {} };
    const badArgs = { ...createList("B"), args: { id: uuidv7(), kind: "playlist" } };
    const result = await runBatch(batch(createList("A"), unknown, badArgs, createList("C")), run);
    expect(statuses(result.items)).toEqual([
      "confirmed",
      "validation_failed",
      "validation_failed",
      "confirmed",
    ]);
    const outcome = result.items[2]?.outcome;
    expect(
      outcome?.status === "failed" && outcome.problem.errors?.map((error) => error.path),
    ).toEqual(["args.kind", "args.parentId", "args.name"]);
    expect(ran).toHaveLength(2);
  });

  test("skips a dependent of a failed, conflicting or skipped prerequisite, down the chain", async () => {
    const conflict: Outcome = {
      status: "conflict",
      conflicts: [{ field: "name", current: "X", attempted: "Y" }],
    };
    const { run, ran } = stub({ Failing: failure("name_conflict", "Taken."), Stale: conflict });
    const failing = createList("Failing");
    const stale = createList("Stale");
    const afterFailing = createList("After failing", [failing.mutationId]);
    const afterStale = createList("After stale", [stale.mutationId]);
    const third = createList("Third", [afterFailing.mutationId]);
    const result = await runBatch(batch(failing, stale, afterFailing, afterStale, third), run);

    expect(result.items.map(({ outcome }) => outcome).slice(2)).toEqual([
      { status: "skipped", dependsOn: failing.mutationId, because: "failed" },
      { status: "skipped", dependsOn: stale.mutationId, because: "conflict" },
      { status: "skipped", dependsOn: afterFailing.mutationId, because: "skipped" },
    ]);
    expect(ran.map((mutation) => mutation.mutationId)).toEqual([
      failing.mutationId,
      stale.mutationId,
    ]);
  });

  test("skips on an invalid prerequisite, and names the first that wasn't confirmed", async () => {
    const { run } = stub({ Failing: failure("name_conflict", "Taken.") });
    const fine = createList("Fine");
    const invalid = { mutationId: uuidv7(), name: "album.delete" };
    const failing = createList("Failing");
    const dependent = createList("Dependent", [
      fine.mutationId,
      failing.mutationId,
      invalid.mutationId,
    ]);
    const result = await runBatch(batch(fine, invalid, failing, dependent), run);
    expect(result.items[3]?.outcome).toEqual({
      status: "skipped",
      dependsOn: failing.mutationId,
      because: "failed",
    });
  });

  test("runs a dependent once its prerequisites are confirmed, without its dependsOn", async () => {
    const { run, ran } = stub();
    const first = createList("First");
    const second = createList("Second", [first.mutationId]);
    const result = await runBatch(batch(first, second), run);
    expect(statuses(result.items)).toEqual(["confirmed", "confirmed"]);
    const { dependsOn: _, ...envelope } = second;
    expect(ran[1]).toEqual(envelope);
  });

  test("fails an item that depends on a later item, itself or one not in the batch", async () => {
    const { run, ran } = stub();
    const later = createList("Later");
    const early = createList("Early", [later.mutationId]);
    const self = createList("Self");
    self.dependsOn = [self.mutationId];
    const outside = createList("Outside", [uuidv7()]);
    const result = await runBatch(batch(early, later, self, outside), run);
    expect(statuses(result.items)).toEqual([
      "validation_failed",
      "confirmed",
      "validation_failed",
      "validation_failed",
    ]);
    const outcome = result.items[0]?.outcome;
    expect(outcome?.status === "failed" && outcome.problem.errors).toEqual([
      { path: "dependsOn.0", message: "Not an earlier item of this batch" },
    ]);
    expect(ran.map((mutation) => mutation.mutationId)).toEqual([later.mutationId]);
  });
});
