// Tombstones on a Trash unit against the local Postgres 18 (FR-14.1): what an album or list left behind, kept as
// objects so recovery can name it. Drizzle 1.0 rc.5 changed how a jsonb parameter is sent, and an appended
// tombstone became a JSON string without any other test noticing (TON-203).

import { afterEach, beforeEach, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { trashRetentionDays, uuidv7, type Tombstone } from "@tonaris/domain";

import { trashUnits, users } from "./schema";
import { collectionStore } from "./store";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

test("tombstones are appended as objects, in order", async () => {
  const ownerId = uuidv7();
  await t.db.insert(users).values({ id: ownerId, email: `${ownerId}@example.com` });
  const unitId = uuidv7();
  await t.db.insert(trashUnits).values({
    id: unitId,
    ownerId,
    kind: "list",
    rootId: uuidv7(),
    deletedAt: new Date(),
    expiresAt: new Date(Date.now() + trashRetentionDays * 86_400_000),
  });
  const album: Tombstone = { id: uuidv7(), title: "Bleach", artist: "Nirvana" };
  const list: Tombstone = { kind: "list", id: uuidv7(), name: "Grunge" };

  await t.db.transaction(async (tx) => {
    const store = collectionStore(tx);
    await store.addTombstone(unitId, album);
    await store.addTombstone(unitId, list);
  });

  const [unit] = await t.db
    .select({ tombstones: trashUnits.tombstones })
    .from(trashUnits)
    .where(eq(trashUnits.id, unitId));
  expect(unit?.tombstones).toEqual([album, list]);
});
