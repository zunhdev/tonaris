// What the creator sees of the service's health (TS-115): the jobs that gave up. Their errors are redacted as logs
// are; their payloads stay out. Backups are Render's (TS-112), so their status is on Render's dashboard.

import { desc, isNotNull } from "drizzle-orm";

import { redactText } from "@tonaris/domain";

import type { Database } from "./client";
import { jobs } from "./schema";

export type OperationsStatus = {
  failedJobs: {
    id: string;
    kind: string;
    attempts: number;
    lastError: string | null;
    deadAt: Date;
  }[];
};

/** The 50 latest jobs that gave up, newest first. */
export async function operationsStatus(db: Database): Promise<OperationsStatus> {
  const failed = await db
    .select({
      id: jobs.id,
      kind: jobs.kind,
      attempts: jobs.attempts,
      lastError: jobs.lastError,
      deadAt: jobs.deadAt,
    })
    .from(jobs)
    .where(isNotNull(jobs.deadAt))
    .orderBy(desc(jobs.deadAt))
    .limit(50);
  return {
    failedJobs: failed.flatMap((job) =>
      job.deadAt
        ? [{ ...job, deadAt: job.deadAt, lastError: job.lastError && redactText(job.lastError) }]
        : [],
    ),
  };
}
