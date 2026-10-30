// Admin → Operations (TS-115): the creator sees the jobs that gave up, redacted; a member can't.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { jobs } from "@tonaris/db";
import { uuidv7 } from "@tonaris/domain";

import { createTestApp, insertUser } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

describe("GET /v1/admin/operations", () => {
  test("the creator sees the failed jobs, redacted", async () => {
    await insertUser(t.db, "creator@example.com", { role: "creator" });
    const { cookie } = await t.signIn("creator@example.com");
    const deadAt = new Date("2026-10-30T03:00:00Z");
    await t.db.insert(jobs).values({
      id: uuidv7(),
      kind: "email",
      payload: {},
      attempts: 4,
      lastError: "Resend refused ben@example.com",
      deadAt,
    });

    const response = await t.call("/v1/admin/operations", { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      failedJobs: [
        {
          kind: "email",
          attempts: 4,
          lastError: "Resend refused [email]",
          deadAt: deadAt.toISOString(),
        },
      ],
    });
  });

  test("the test error fails on purpose, and its answer shows none of it", async () => {
    await insertUser(t.db, "creator@example.com", { role: "creator" });
    const { cookie } = await t.signIn("creator@example.com");
    const response = await t.call("/v1/admin/operations/test-error", {
      json: {},
      headers: { cookie },
    });
    expect(response.status).toBe(500);
    // The report goes to the logs and Sentry, redacted (observability.test.ts); the answer is a bare problem.
    expect(await response.text()).not.toContain("anna@example.com");
  });

  test("a member is refused", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    expect((await t.call("/v1/admin/operations", { headers: { cookie } })).status).toBe(403);
  });
});
