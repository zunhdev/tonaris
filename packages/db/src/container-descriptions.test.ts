// Folder and list descriptions against the local Postgres 18 (FR-03.5, FR-12.4, TS-121; AC-03): saved and in the
// bootstrap, kept through Trash and recovery, and never matched by search.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { uuidv7, type Mutation, type Principal } from "@tonaris/domain";

import { containers, trashUnits, users } from "./schema";
import { searchCollection } from "./search";
import { bootstrapSnapshot, executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let anna: Principal & { kind: "user" };

beforeEach(async () => {
  t = await createTestDatabase();
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  anna = { kind: "user", userId, role: "user", client: "web" };
});

afterEach(async () => {
  await t.drop();
});

async function confirmed(mutation: Mutation) {
  const { result } = await executeMutation(t.db, anna, mutation);
  expect(result.outcome).toMatchObject({ status: "confirmed" });
}

describe("descriptions in Postgres (FR-03.5, FR-12.4)", () => {
  test("a description is saved, kept through Trash and recovery, and not searched", async () => {
    const id = uuidv7();
    await confirmed({
      mutationId: uuidv7(),
      name: "container.create",
      args: { id, kind: "list", parentId: null, name: "Grunge" },
    });
    await confirmed({
      mutationId: uuidv7(),
      name: "container.describe",
      args: { id, description: "Nirvana and friends" },
      base: { description: null },
    });
    const described = async () =>
      (await bootstrapSnapshot(t.db, anna.userId)).containers.find((each) => each.id === id)
        ?.description;
    expect(await described()).toBe("Nirvana and friends");

    // In Trash and back, the record keeps it (TS-13).
    const unitId = uuidv7();
    const deletedAt = new Date();
    await t.db.insert(trashUnits).values({
      id: unitId,
      ownerId: anna.userId,
      kind: "list",
      rootId: id,
      deletedAt,
      expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
    });
    await t.db
      .update(containers)
      .set({ trashedAt: deletedAt, trashUnitId: unitId })
      .where(eq(containers.id, id));
    const [trashed] = await t.db.select().from(containers).where(eq(containers.id, id));
    expect(trashed?.description).toBe("Nirvana and friends");
    await t.db
      .update(containers)
      .set({ trashedAt: null, trashUnitId: null })
      .where(eq(containers.id, id));
    expect(await described()).toBe("Nirvana and friends");

    const found = await searchCollection(t.db, {
      ownerId: anna.userId,
      query: "Nirvana",
      limit: 10,
    });
    expect([found.folders.total, found.lists.total, found.albums.total]).toEqual([0, 0, 0]);
  });
});
