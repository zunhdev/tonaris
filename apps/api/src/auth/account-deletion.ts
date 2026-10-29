// Following an account deletion (TS-74, DS-97): its session ended when it started, so the page asks with the
// token the confirmation answered, which only that browser holds. A failed deletion can be queued again.

import { Elysia } from "elysia";

import { findAccountDeletion, retryAccountDeletion, type Database } from "@tonaris/db";
import {
  accountDeletionProgressSchema,
  accountDeletionRefusalDetails as refusals,
  accountDeletionTokenSchema,
} from "@tonaris/domain";

import { ProblemError } from "../problem";
import { sha256 } from "./secrets";

const unknown = () => new ProblemError(404, "not_found", refusals.none);

export function accountDeletionProgressRoutes({
  db,
  wakeJobs,
}: {
  db: Database;
  wakeJobs: () => void;
}) {
  return new Elysia()
    .post(
      "/auth/account-deletion/progress",
      {
        body: accountDeletionTokenSchema,
        response: { 200: accountDeletionProgressSchema },
        detail: { hide: true },
      },
      async ({ body }) => {
        const deletion = await findAccountDeletion(db, sha256(body.token));
        if (!deletion) throw unknown();
        return { status: deletion.status };
      },
    )
    .post(
      "/auth/account-deletion/retry",
      {
        body: accountDeletionTokenSchema,
        response: { 200: accountDeletionProgressSchema },
        detail: { hide: true },
      },
      async ({ body }) => {
        const status = await retryAccountDeletion(db, sha256(body.token), {
          jobId: Bun.randomUUIDv7(),
        });
        if (!status) throw unknown();
        if (status === "deleting") wakeJobs();
        return { status };
      },
    );
}
