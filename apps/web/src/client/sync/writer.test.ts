// The save states on their own (DS-80, DS-81): what Activity lists, and the failures and conflicts kept in the
// browser until the person deals with them (FR-09.4, FR-13.2). The writes themselves are covered in sync.test.ts.

import { describe, expect, test } from "bun:test";

import { failure, uuidv7, type Mutation, type Outcome } from "@tonaris/domain";

import { memoryPersistence } from "./persistence";
import { createSaveStates } from "./writer";

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
