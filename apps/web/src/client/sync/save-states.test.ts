// The save states on their own (DS-80, DS-81, DS-84): what Activity lists, the failures and conflicts kept in the
// browser until the person deals with them (FR-09.4, FR-13.2), and batch reports. The writes themselves are covered
// in sync.test.ts.

import { describe, expect, test } from "bun:test";

import {
  failure,
  outcomeStatuses,
  uuidv7,
  type Mutation,
  type Outcome,
  type OutcomeStatus,
} from "@tonaris/domain";

import { memoryPersistence } from "./persistence";
import {
  createSaveStates,
  isUnderway,
  markerStatuses,
  needsPerson,
  storeOf,
  type BatchReport,
} from "./save-states";

const rename = (name: string): Mutation => ({
  mutationId: uuidv7(),
  name: "container.rename",
  args: { id: uuidv7(), name },
  base: { name: "Later" },
});

const conflict: Outcome = {
  status: "conflict",
  conflicts: [{ field: "name", current: "Soon", attempted: "Favorites", base: "Later" }],
};

const statuses = (states: ReturnType<typeof createSaveStates>) =>
  states.open().map((state) => [state.key, state.status]);

describe("save states (DS-80, DS-81)", () => {
  test("open() lists what isn't saved yet, in the order it was made, and drops confirmed and dismissed writes", () => {
    const states = createSaveStates();
    const [saved, failed, clashing, waiting, queued] = ["A", "B", "C", "D", "E"].map(rename);
    for (const [index, each] of [saved, failed, clashing, waiting, queued].entries()) {
      states.track(each!, "ABCDE"[index]!);
    }
    states.settle(saved!.mutationId, { status: "confirmed", seq: 1, result: null });
    states.settle(failed!.mutationId, failure("name_conflict", "'B' already exists."));
    states.settle(clashing!.mutationId, conflict);
    states.unconfirmed(waiting!.mutationId);

    expect(statuses(states)).toEqual([
      ["B", "failed"],
      ["C", "conflict"],
      ["D", "unconfirmed"],
      ["E", "pending"],
    ]);
    // The same array until something changes, as React's external stores need.
    expect(states.open()).toBe(states.open());

    states.dismiss(failed!.mutationId);
    states.dismiss(clashing!.mutationId);
    // A write still on its way can't be dismissed.
    states.dismiss(queued!.mutationId);
    expect(statuses(states)).toEqual([
      ["D", "unconfirmed"],
      ["E", "pending"],
    ]);
  });

  test("a dismissal notifies the change listeners", () => {
    const states = createSaveStates();
    const attempt = rename("Favorites");
    states.track(attempt, "list");
    states.settle(attempt.mutationId, conflict);
    let changes = 0;
    states.onChange(() => {
      changes += 1;
    });
    states.dismiss(attempt.mutationId);
    expect(changes).toBe(1);
  });

  test("a failure is kept until dismissed, and restored by the next page", async () => {
    const persistence = memoryPersistence();
    const states = createSaveStates({ persistence });
    const attempt = rename("Favorites");
    const rejected = failure("name_conflict", "'Favorites' already exists in Collection.");
    states.track(attempt, "list");
    states.settle(attempt.mutationId, rejected);
    await Bun.sleep(1);

    const later = createSaveStates({ persistence });
    await later.restore();
    expect(later.open()).toEqual([
      {
        mutation: attempt,
        key: "list",
        status: "failed",
        outcome: rejected,
        since: expect.any(Number),
      },
    ]);
    later.dismiss(attempt.mutationId);
    await Bun.sleep(1);
    expect(await persistence.failures()).toEqual([]);
  });
});

const confirmed: Outcome = { status: "confirmed", seq: 1, result: null };
const taken = failure("name_conflict", "'B' already exists at the top level. Choose another name.");

/** Tracks `writes` as one transaction's, as the writer does. */
function batchOf(states: ReturnType<typeof createSaveStates>, writes: Mutation[]) {
  const batch = states.batchFor(writes.length);
  for (const write of writes) states.track(write, write.mutationId, "pending", batch);
  return batch;
}

describe("batch reports (FR-13.4, DS-84)", () => {
  test("one write is no batch; two are, and the report closes by itself once both are confirmed", () => {
    const states = createSaveStates();
    expect(states.batchFor(1)).toBeUndefined();
    const writes = [rename("A"), rename("B")];
    const id = batchOf(states, writes);
    const heard: [BatchReport, boolean][] = [];
    states.onReport((report, closed) => heard.push([report, closed]));
    expect(states.reports().map((report) => report.items.map((item) => item.status))).toEqual([
      ["pending", "pending"],
    ]);
    // Its writes are listed for the indicator, each carrying its batch.
    expect(states.open().map((state) => state.batch)).toEqual([id, id]);

    for (const write of writes) states.settle(write.mutationId, confirmed);
    expect(states.reports()).toEqual([]);
    expect(heard.at(-1)?.[1]).toBe(true);
    expect(heard.at(-1)?.[0].items.map((item) => item.status)).toEqual(["confirmed", "confirmed"]);
  });

  test("a report with a failure is kept, in the browser too, and comes back for the next page", async () => {
    const persistence = memoryPersistence();
    const states = createSaveStates({ persistence });
    const writes = [rename("A"), rename("B"), rename("C")];
    const id = batchOf(states, writes);
    states.settle(writes[0]!.mutationId, confirmed);
    states.settle(writes[1]!.mutationId, taken);
    states.settle(writes[2]!.mutationId, {
      status: "skipped",
      dependsOn: writes[1]!.mutationId,
      because: "failed",
    });
    expect(states.reports()).toMatchObject([{ id, kept: true }]);
    await Bun.sleep(1);
    // Kept in its report, not on its own.
    expect(await persistence.failures()).toEqual([]);
    expect((await persistence.batches()).map((batch) => batch.items.length)).toEqual([3]);

    const later = createSaveStates({ persistence });
    await later.restore();
    expect(later.reports()).toMatchObject([
      {
        id,
        kept: true,
        items: [{ status: "confirmed" }, { status: "failed" }, { status: "skipped" }],
      },
    ]);
    expect(later.open().map((state) => state.status)).toEqual(["failed", "skipped"]);

    // Dismissing a write takes it out of its report, and dismissing the report deletes it.
    later.dismiss(writes[2]!.mutationId);
    expect(later.reports()[0]?.items.map((item) => item.status)).toEqual(["confirmed", "failed"]);
    await Bun.sleep(1);
    expect((await persistence.batches())[0]?.items.length).toBe(2);
    later.dismissReport(id!);
    expect(later.reports()).toEqual([]);
    expect(later.open()).toEqual([]);
    await Bun.sleep(1);
    expect(await persistence.batches()).toEqual([]);
  });

  test("writes made within() a report join it, in place of the ones they retry", () => {
    const states = createSaveStates();
    const writes = [rename("A"), rename("B")];
    const id = batchOf(states, writes);
    states.settle(writes[0]!.mutationId, confirmed);
    states.settle(writes[1]!.mutationId, taken);

    const retry = rename("B");
    states.within(id!, () => {
      // A single write joins too.
      states.track(retry, retry.mutationId, "pending", states.batchFor(1));
    });
    states.dismiss(writes[1]!.mutationId);
    expect(states.batchFor(1)).toBeUndefined();
    expect(states.reports()[0]?.items.map((item) => item.mutation.mutationId)).toEqual([
      writes[0]!.mutationId,
      retry.mutationId,
    ]);

    states.settle(retry.mutationId, confirmed);
    // Kept once something didn't save, it stays until dismissed, now wholly saved.
    expect(states.reports()).toMatchObject([{ id, kept: true }]);
  });

  test("dismissing a report leaves its writes still underway to go on on their own", () => {
    const states = createSaveStates();
    const writes = [rename("A"), rename("B")];
    const id = batchOf(states, writes);
    states.settle(writes[0]!.mutationId, taken);
    states.dismissReport(id!);
    expect(states.open().map((state) => [state.status, state.batch])).toEqual([
      ["pending", undefined],
    ]);
  });
});

/** The statuses `holds` holds for, in the vocabulary's order. */
const where = (holds: (status: OutcomeStatus) => unknown) =>
  outcomeStatuses.filter((status) => holds(status));

describe("status categories (TON-147)", () => {
  test("a write is underway, saved, or waits for the person, never two of them", () => {
    expect(where(isUnderway)).toEqual(["pending", "unconfirmed"]);
    expect(where(needsPerson)).toEqual([
      "failed",
      "conflict",
      "needs_input",
      "needs_approval",
      "skipped",
    ]);
  });

  test("a record without a write is neither", () => {
    expect(isUnderway(undefined)).toBe(false);
    expect(needsPerson(undefined)).toBe(false);
  });

  test("a marker shows every state but saved", () => {
    expect(new Set(markerStatuses)).toEqual(new Set(where((status) => status !== "confirmed")));
  });

  test("conflicts and failures, with captures waiting for input, each have their store", () => {
    expect(where((status) => storeOf(status) === "conflicts")).toEqual(["conflict"]);
    expect(where((status) => storeOf(status) === "failures")).toEqual(["failed", "needs_input"]);
  });
});
