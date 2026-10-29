// The job queue's storage (TS-90). A worker claims the job due longest with `FOR UPDATE SKIP LOCKED`, so two workers
// never take the same one, and holds it for a lease: a worker that dies lets its jobs go when the lease ends.

import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import type { Database, Transaction } from "./client";
import { jobs } from "./schema";

export type JobRow = typeof jobs.$inferSelect;

/** How long a dead job is kept, for the record, before the daily prune removes it. */
export const deadJobRetentionMs = 30 * 24 * 60 * 60_000;

/**
 * Queues a job of `kind` to run at `runAt`, now by default. Times come from the API's clock, which claims compare
 * with: the database's `now()`, rounded to the millisecond, could put a new job a moment in the claim's future.
 */
export async function enqueueJob(
  db: Database | Transaction,
  {
    id,
    kind,
    payload,
    runAt = new Date(),
  }: { id: string; kind: string; payload: unknown; runAt?: Date },
): Promise<void> {
  await db.insert(jobs).values({ id, kind, payload, runAt });
}

/**
 * Claims the live job of one of `kinds` that has been due longest, counting the attempt and holding it for
 * `leaseMs`. Answers nothing when no job is due.
 */
export async function claimJob(
  db: Database,
  { kinds, now, leaseMs }: { kinds: readonly string[]; now: Date; leaseMs: number },
): Promise<JobRow | undefined> {
  const due = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        isNull(jobs.deadAt),
        inArray(jobs.kind, [...kinds]),
        lte(jobs.runAt, now),
        or(isNull(jobs.lockedUntil), lte(jobs.lockedUntil, now)),
      ),
    )
    .orderBy(asc(jobs.runAt), asc(jobs.id))
    .limit(1)
    .for("update", { skipLocked: true });
  const [claimed] = await db
    .update(jobs)
    .set({
      attempts: sql`${jobs.attempts} + 1`,
      lockedUntil: new Date(now.getTime() + leaseMs),
      updatedAt: now,
    })
    .where(inArray(jobs.id, due))
    .returning();
  return claimed;
}

/** Removes a job that finished. */
export async function finishJob(db: Database, id: string): Promise<void> {
  await db.delete(jobs).where(eq(jobs.id, id));
}

/** Lets a job that failed go, to run again at `runAt`. */
export async function retryJob(
  db: Database,
  id: string,
  { runAt, error }: { runAt: Date; error: string },
): Promise<void> {
  await db
    .update(jobs)
    .set({ runAt, lockedUntil: null, lastError: error })
    .where(and(eq(jobs.id, id), isNull(jobs.deadAt)));
}

/** Gives a job up for good, keeping `payload` in place of its own: the caller removes what mustn't be kept. */
export async function buryJob(
  db: Database,
  id: string,
  { error, payload, now }: { error: string; payload: unknown; now: Date },
): Promise<void> {
  await db
    .update(jobs)
    .set({ deadAt: now, lockedUntil: null, lastError: error, payload })
    .where(eq(jobs.id, id));
}

/** Removes the jobs that died more than 30 days before `now` (TS-91's daily prune). */
export async function pruneDeadJobs(db: Database | Transaction, now: Date): Promise<void> {
  await db
    .delete(jobs)
    .where(
      and(isNotNull(jobs.deadAt), lt(jobs.deadAt, new Date(now.getTime() - deadJobRetentionMs))),
    );
}
