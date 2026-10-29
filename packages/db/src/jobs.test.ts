// The job queue's storage (TS-90), against the local Postgres 18 (TS-121): claims in due order, one worker per job,
// leases that run out, retries, burial and the prune.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  buryJob,
  claimJob,
  deadJobRetentionMs,
  enqueueJob,
  finishJob,
  pruneDeadJobs,
  retryJob,
} from "./jobs";
import { jobs } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const now = new Date("2026-10-29T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const minute = 60_000;

const queue = (id: string, runAt = now, kind = "email") =>
  enqueueJob(t.db, { id, kind, payload: { id }, runAt });

describe("claimJob", () => {
  test("takes the job due longest, of the kinds asked for, and counts the attempt", async () => {
    await queue("01a18700-0000-7000-8000-000000000002", later(1));
    await queue("01a18700-0000-7000-8000-000000000001", now);
    await queue("01a18700-0000-7000-8000-000000000003", now, "other");
    await queue("01a18700-0000-7000-8000-000000000004", later(minute));

    const claim = () => claimJob(t.db, { kinds: ["email"], now: later(10), leaseMs: minute });
    expect(await claim()).toMatchObject({
      id: "01a18700-0000-7000-8000-000000000001",
      attempts: 1,
      lockedUntil: later(10 + minute),
    });
    expect((await claim())?.id).toBe("01a18700-0000-7000-8000-000000000002");
    // The others are another kind, or not due yet.
    expect(await claim()).toBeUndefined();
  });

  test("two workers claiming at once never take the same job", async () => {
    const ids = Array.from(
      { length: 10 },
      (_, index) => `01a18700-0000-7000-8000-${String(index).padStart(12, "0")}`,
    );
    await Promise.all(ids.map((id) => queue(id)));
    const claims = await Promise.all(
      Array.from({ length: 12 }, () => claimJob(t.db, { kinds: ["email"], now, leaseMs: minute })),
    );
    const claimed = claims.flatMap((job) => (job ? [job.id] : []));
    expect(claimed.toSorted()).toEqual(ids);
  });

  test("a held job is free again when its lease runs out, as when its worker stopped", async () => {
    const id = "01a18700-0000-7000-8000-000000000001";
    await queue(id);
    await claimJob(t.db, { kinds: ["email"], now, leaseMs: minute });
    expect(
      await claimJob(t.db, { kinds: ["email"], now: later(minute - 1), leaseMs: minute }),
    ).toBeUndefined();
    expect(
      await claimJob(t.db, { kinds: ["email"], now: later(minute), leaseMs: minute }),
    ).toMatchObject({ id, attempts: 2 });
  });
});

describe("after a run", () => {
  const id = "01a18700-0000-7000-8000-000000000001";

  test("a finished job is gone; a retried one waits for its time and keeps the error", async () => {
    await queue(id);
    await claimJob(t.db, { kinds: ["email"], now, leaseMs: minute });
    await retryJob(t.db, id, { runAt: later(5_000), error: "Resend didn't answer in time." });
    const [row] = await t.db.select().from(jobs);
    expect(row).toMatchObject({
      runAt: later(5_000),
      lockedUntil: null,
      lastError: "Resend didn't answer in time.",
    });
    expect(
      await claimJob(t.db, { kinds: ["email"], now: later(4_999), leaseMs: minute }),
    ).toBeUndefined();
    expect(
      await claimJob(t.db, { kinds: ["email"], now: later(5_000), leaseMs: minute }),
    ).toMatchObject({ id, attempts: 2 });

    await finishJob(t.db, id);
    expect(await t.db.select().from(jobs)).toEqual([]);
  });

  test("a buried job never runs again, keeps what it was given, and is pruned after 30 days", async () => {
    await queue(id);
    await claimJob(t.db, { kinds: ["email"], now, leaseMs: minute });
    await buryJob(t.db, id, { error: "Resend refused the email", payload: { kept: true }, now });
    expect(await t.db.select().from(jobs)).toEqual([
      expect.objectContaining({ deadAt: now, payload: { kept: true }, lockedUntil: null }),
    ]);
    expect(
      await claimJob(t.db, { kinds: ["email"], now: later(minute * 10), leaseMs: minute }),
    ).toBeUndefined();

    await pruneDeadJobs(t.db, later(deadJobRetentionMs));
    expect(await t.db.select().from(jobs)).toHaveLength(1);
    await pruneDeadJobs(t.db, later(deadJobRetentionMs + 1));
    expect(await t.db.select().from(jobs)).toEqual([]);
  });
});
