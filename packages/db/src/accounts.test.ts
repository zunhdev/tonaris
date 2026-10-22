// Session liveness for the change streams (TS-23) against the local Postgres 18.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { activeSessionIds } from "./accounts";
import { sessions, users } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

describe("activeSessionIds", () => {
  test("returns the sessions that exist and haven't expired", async () => {
    const userId = Bun.randomUUIDv7();
    await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
    const now = new Date("2026-10-22T12:00:00.000Z");
    const session = (expiresAt: Date) => ({
      id: Bun.randomUUIDv7(),
      userId,
      token: Bun.randomUUIDv7(),
      expiresAt,
    });
    const live = session(new Date("2026-11-21T12:00:00.000Z"));
    const expired = session(new Date("2026-10-22T11:59:59.000Z"));
    await t.db.insert(sessions).values([live, expired]);
    const deleted = Bun.randomUUIDv7();

    const active = await activeSessionIds(t.db, [live.id, expired.id, deleted], now);
    expect([...active]).toEqual([live.id]);
    expect(await activeSessionIds(t.db, [], now)).toEqual(new Set());
  });
});
