// The periodic jobs against the local Postgres 18 (TS-90, TS-91): what the sync-history prune keeps, one runner
// at a time across instances, and a stop that waits for the run in progress.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { changeLog, containers, mutations, trashUnits, users } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { syncRetentionMs, uuidv7 } from "@tonaris/domain";

import {
  pruneSyncHistorySchedule,
  runSchedule,
  startSchedules,
  trashExpirySchedule,
  type Schedule,
} from "./schedules";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

/** A schedule that takes `ms` to run and counts its runs. */
function slowSchedule(ms: number) {
  let runs = 0;
  let finished = 0;
  const schedule: Schedule = {
    name: `slow-${uuidv7()}`,
    everyMs: 60_000,
    async run() {
      runs += 1;
      await Bun.sleep(ms);
      finished += 1;
    },
  };
  return {
    schedule,
    get runs() {
      return runs;
    },
    get finished() {
      return finished;
    },
  };
}

describe("prune-sync-history (TS-91)", () => {
  test("removes changes and outcomes older than 30 days, and keeps the rest", async () => {
    const accountId = uuidv7();
    await t.db.insert(users).values({ id: accountId, email: `${accountId}@example.com` });
    const now = new Date("2026-10-22T12:00:00.000Z");
    const old = new Date(now.getTime() - syncRetentionMs - 1_000);
    const recent = new Date(now.getTime() - syncRetentionMs + 60_000);
    await t.db.insert(changeLog).values(
      [old, recent].map((createdAt, index) => ({
        accountId,
        seq: index + 1,
        entity: "album",
        entityId: uuidv7(),
        op: "insert",
        createdAt,
      })),
    );
    await t.db.insert(mutations).values(
      [old, recent].map((receivedAt) => ({
        id: uuidv7(),
        accountId,
        principal: "user:web",
        name: "album.create",
        status: "confirmed",
        receivedAt,
      })),
    );

    expect(await runSchedule(t.db, pruneSyncHistorySchedule, now)).toBe(true);
    expect((await t.db.select().from(changeLog)).map((row) => row.seq)).toEqual([2]);
    expect((await t.db.select().from(mutations)).map((row) => row.receivedAt)).toEqual([recent]);
  });
});

describe("schedules (TS-90)", () => {
  test("two runs started at once run the task once", async () => {
    const slow = slowSchedule(100);
    const ran = await Promise.all([
      runSchedule(t.db, slow.schedule),
      runSchedule(t.db, slow.schedule),
    ]);
    expect(ran.toSorted()).toEqual([false, true]);
    expect(slow.runs).toBe(1);
  });

  test("run first after a delay, and stop() waits for the run in progress", async () => {
    const slow = slowSchedule(100);
    const schedules = startSchedules(t.db, [slow.schedule], { firstAfterMs: 20 });
    await Bun.sleep(5);
    expect(slow.runs).toBe(0);
    while (slow.runs === 0) {
      // oxlint-disable-next-line no-await-in-loop
      await Bun.sleep(5);
    }
    await schedules.stop();
    expect(slow.finished).toBe(1);
  });
});

describe("trash-expiry (TS-91, FR-01.17)", () => {
  test("purges units past their expiry and publishes each owner's changes", async () => {
    const ownerId = uuidv7();
    await t.db.insert(users).values({ id: ownerId, email: `${ownerId}@example.com` });
    const [listId, unitId] = [uuidv7(), uuidv7()];
    const deletedAt = new Date(Date.now() - 31 * 86_400_000);
    await t.db.insert(trashUnits).values({
      id: unitId,
      ownerId,
      kind: "list",
      rootId: listId,
      deletedAt,
      expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
    });
    await t.db.insert(containers).values({
      id: listId,
      ownerId,
      kind: "list",
      parentId: null,
      name: "Doom",
      nameKey: "doom",
      searchNameKey: "doom",
      trashedAt: deletedAt,
      trashUnitId: unitId,
    });
    const published: { accountId: string; ids: string[] }[] = [];
    const schedule = trashExpirySchedule(t.db, (accountId, changes) =>
      published.push({ accountId, ids: changes.map((change) => change.id) }),
    );
    expect(await runSchedule(t.db, schedule)).toBe(true);
    expect(published).toEqual([{ accountId: ownerId, ids: [unitId] }]);
    expect(await t.db.select().from(containers)).toEqual([]);
  });
});
