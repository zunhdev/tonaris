// The job queue (TS-90): work that runs after the request that asked for it, retried with backoff, in the API
// process. Email is the first kind (TS-72). A finished job is deleted; one that gave up stays, marked dead, with its
// payload's secrets removed, until the daily prune.

import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, text, uuid } from "drizzle-orm/pg-core";

import { instant, table, timestamps } from "./columns";

export const jobs = table(
  "jobs",
  {
    id: uuid().primaryKey(),
    kind: text().notNull(),
    payload: jsonb().notNull(),
    // When the job may run next: now for a new one, later for a retry.
    runAt: instant().notNull().defaultNow(),
    // How many times a worker has claimed it.
    attempts: integer().notNull().default(0),
    // While set and in the future, a worker holds the job; a worker that died lets it go when this passes.
    lockedUntil: instant(),
    lastError: text(),
    // Set when the job gave up; it never runs again.
    deadAt: instant(),
    ...timestamps,
  },
  (t) => [
    // The claim's search: live jobs by when they're due.
    index("jobs_due_idx")
      .on(t.runAt)
      .where(sql`${t.deadAt} is null`),
    check("jobs_attempts_check", sql`${t.attempts} >= 0`),
  ],
);
