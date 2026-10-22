// The in-memory store the Bun tests use in place of IndexedDB, which the browser tests cover (TS-22, TS-24).

import { describe, expect, test } from "bun:test";

import { uuidv7, type Mutation } from "@tonaris/domain";

import { memoryPersistence, type OutboxEntry } from "./persistence";

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

  test("clear() forgets everything", async () => {
    const store = memoryPersistence();
    await store.putEntry(entry(1));
    await store.clear();
    expect(await store.entries()).toEqual([]);
  });
});
