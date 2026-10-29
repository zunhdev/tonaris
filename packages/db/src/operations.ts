// What the creator sees of the service's health (TS-115): jobs that gave up, and the last operator backup
// (TS-112). The job errors are redacted as logs are; their payloads stay out.

import { desc, isNotNull } from "drizzle-orm";

import { redactText } from "@tonaris/domain";

import type { Database } from "./client";
import { backupRuns, jobs } from "./schema";

export type OperationsStatus = {
  failedJobs: {
    id: string;
    kind: string;
    attempts: number;
    lastError: string | null;
    deadAt: Date;
  }[];
  lastBackup: { finishedAt: Date; objectKey: string; bytes: number } | null;
};

/** The 50 latest jobs that gave up, newest first, and the last backup. */
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
  const [lastBackup] = await db
    .select({
      finishedAt: backupRuns.finishedAt,
      objectKey: backupRuns.objectKey,
      bytes: backupRuns.bytes,
    })
    .from(backupRuns)
    .orderBy(desc(backupRuns.finishedAt))
    .limit(1);
  return {
    failedJobs: failed.flatMap((job) =>
      job.deadAt
        ? [{ ...job, deadAt: job.deadAt, lastError: job.lastError && redactText(job.lastError) }]
        : [],
    ),
    lastBackup: lastBackup ?? null,
  };
}
