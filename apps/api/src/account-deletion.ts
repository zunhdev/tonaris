// The account deletion job (TS-74, TS-90): after confirming stopped access and sharing, it removes the owned data
// in chunks and the account last, then marks the deletion done and tells the account's guest pages and viewers to
// read again. It retries, then gives up as failed; the deletion's page offers Retry, which queues it again.

import { z } from "zod";

import { type Database, deleteAccountData, finishAccountDeletion } from "@tonaris/db";
import { accountDeletionJobKind } from "@tonaris/domain";

import type { JobHandler } from "./jobs";

const payloadSchema = z.object({ deletionId: z.uuid(), userId: z.uuid() });

export function accountDeletionJob(
  db: Database,
  /** Tells the account's watchers, guests and viewers of its shares, that it changed (TON-70). */
  notify: (accountId: string) => void,
): JobHandler {
  return {
    kind: accountDeletionJobKind,
    async run(job) {
      const { deletionId, userId } = payloadSchema.parse(job.payload);
      await deleteAccountData(db, userId);
      await finishAccountDeletion(db, deletionId, "deleted");
      notify(userId);
    },
    async buried(job) {
      const payload = payloadSchema.safeParse(job.payload);
      if (payload.success) await finishAccountDeletion(db, payload.data.deletionId, "failed");
      return job.payload;
    },
  };
}
