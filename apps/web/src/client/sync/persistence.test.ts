// The in-memory store the Bun tests use in place of IndexedDB, which the browser tests cover (TS-22, TS-24), and the
// shapes of the records IndexedDB keeps.

import { describe, expect, test } from "bun:test";

import {
  conflictOutcomeSchema,
  failedOutcomeSchema,
  failure as failed,
  needsInputOutcomeSchema,
  uuidv7,
  type Mutation,
} from "@tonaris/domain";

import {
  memoryPersistence,
  storedConflictSchema,
  storedFailureSchema,
  type OutboxEntry,
} from "./persistence";

const mutation = (): Mutation => ({
  mutationId: uuidv7(),
  name: "container.rename",
  args: { id: uuidv7(), name: "Favorites" },
  base: { name: "Later" },
});

const entry = (createdAt: number): OutboxEntry => ({
  id: uuidv7(),
  tab: "tab",
  createdAt,
  items: [{ mutation: mutation(), key: "list" }],
});

const rejected = () => ({
  mutation: mutation(),
  key: "list",
  outcome: failed("name_conflict", "'Favorites' already exists in Collection."),
});

const report = (createdAt: number) => ({
  id: uuidv7(),
  createdAt,
  items: [
    rejected(),
    { ...rejected(), outcome: { status: "confirmed" as const, seq: 3, result: null } },
  ],
});

describe("memoryPersistence", () => {
  test("keeps entries oldest first until deleted, and conflicts by mutation", async () => {
    const store = memoryPersistence();
    const [late, early] = [entry(20), entry(10)];
    await store.putEntry(late);
    await store.putEntry(early);
    expect(await store.entries()).toEqual([early, late]);
    await store.deleteEntry(early.id);
    expect(await store.entries()).toEqual([late]);

    const attempt = mutation();
    const conflict = {
      mutation: attempt,
      key: "list",
      outcome: {
        status: "conflict" as const,
        conflicts: [{ field: "name", current: "Now", attempted: "Favorites", base: "Later" }],
      },
    };
    await store.putConflict(conflict);
    expect(await store.conflicts()).toEqual([conflict]);
    await store.deleteConflict(attempt.mutationId);
    expect(await store.conflicts()).toEqual([]);
  });

  test("keeps failures by mutation until deleted", async () => {
    const store = memoryPersistence();
    const [first, second] = [rejected(), rejected()];
    await store.putFailure(first);
    await store.putFailure(second);
    expect(await store.failures()).toEqual([first, second]);
    await store.deleteFailure(first.mutation.mutationId);
    expect(await store.failures()).toEqual([second]);
  });

  test("keeps batch reports oldest first, replaced by ID, until deleted", async () => {
    const store = memoryPersistence();
    const [late, early] = [report(20), report(10)];
    await store.putBatch(late);
    await store.putBatch(early);
    expect(await store.batches()).toEqual([early, late]);
    const shorter = { ...late, items: late.items.slice(1) };
    await store.putBatch(shorter);
    expect(await store.batches()).toEqual([early, shorter]);
    await store.deleteBatch(early.id);
    expect(await store.batches()).toEqual([shorter]);
  });

  test("clear() forgets everything", async () => {
    const store = memoryPersistence();
    await store.putEntry(entry(1));
    await store.putBatch({ id: uuidv7(), createdAt: 1, items: [rejected()] });
    await store.putFailure({
      mutation: mutation(),
      key: "list",
      outcome: failed("not_found", "Gone."),
    });
    await store.clear();
    expect(await store.entries()).toEqual([]);
    expect(await store.failures()).toEqual([]);
    expect(await store.batches()).toEqual([]);
  });
});

describe("the records IndexedDB keeps (TON-147)", () => {
  test("hold each outcome as the domain reads it, so a field it adds survives a reload", () => {
    const outcome = failed("validation_failed", "Check the title.", [
      { path: "args.title", message: "Required" },
    ]);
    const full = { ...outcome, problem: { ...outcome.problem, instance: "/v1/mutations" } };
    expect(storedFailureSchema.parse({ ...rejected(), outcome: full }).outcome).toEqual(full);
    expect(storedFailureSchema.shape.outcome.options).toEqual([
      failedOutcomeSchema,
      needsInputOutcomeSchema,
    ]);
    expect(storedConflictSchema.shape.outcome).toBe(conflictOutcomeSchema);
  });
});
