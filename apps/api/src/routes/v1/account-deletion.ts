// Deleting the account (FR-11.10, FR-11.11, DS-97, TS-74): the typed sign-in email confirms, and one transaction
// then stops sign-in, sessions, AI connections and sharing, records it, and queues the data job. The answer is
// the token the page follows the deletion with, since the session is gone. App-only (X-03); the creator's
// account can't be deleted.

import { Elysia } from "elysia";
import { z } from "zod";

import { beginAccountDeletion, type Database } from "@tonaris/db";
import {
  accountDeletionConfirmSchema,
  accountDeletionRefusalDetails as refusals,
  authorizeWrite,
  emailKey,
  problemSchema,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { newToken, sha256 } from "../../auth/secrets";
import { ProblemError } from "../../problem";
import type { SyncHub } from "../../sync/hub";

export type AccountDeletionDeps = {
  db: Database;
  /** Wakes the job worker, so the data job starts at once (TS-90). */
  wakeJobs: () => void;
  /**
   * Ends the account's change streams with its sessions, at once (TS-23), and tells its guest pages and viewers to
   * read again, and find nothing (TON-70).
   */
  hub: Pick<SyncHub, "endSessionsOf" | "notify">;
};

export function accountDeletionRoutes(
  session: SessionGuard,
  { db, wakeJobs, hub }: AccountDeletionDeps,
) {
  return new Elysia().use(session).post(
    "/account/deletion",
    {
      signedIn: true,
      body: accountDeletionConfirmSchema,
      response: {
        200: z.object({
          token: z
            .string()
            .meta({ description: "Follows the deletion's progress once signed out." }),
        }),
        401: problemSchema,
        403: problemSchema,
        422: problemSchema,
      },
      detail: {
        summary: "Delete the account",
        description:
          "Permanent. Ends sessions, AI connections and sharing at once, frees the address, and queues the removal of all owned data (FR-11.11). Confirmed by the typed sign-in email.",
        tags: ["accounts"],
        operationId: "deleteAccount",
      },
    },
    async ({ principal, account, body }) => {
      const decision = authorizeWrite(principal, { ownerId: account.id, scope: "account" });
      if (!decision.allowed) {
        throw new ProblemError(403, "permission_denied", "Your account is deleted in the app.");
      }
      if (emailKey(body.email) !== account.email) {
        throw new ProblemError(422, "validation_failed", refusals.mismatch);
      }
      const token = newToken();
      const started = await beginAccountDeletion(db, {
        userId: account.id,
        deletionId: Bun.randomUUIDv7(),
        tokenHash: sha256(token),
        auditId: Bun.randomUUIDv7(),
      });
      if (started === "creator") throw new ProblemError(422, "validation_failed", refusals.creator);
      if (started !== "started")
        throw new ProblemError(401, "unauthenticated", "Sign in to continue.");
      wakeJobs();
      hub.endSessionsOf(account.id);
      hub.notify(account.id);
      return { token };
    },
  );
}
