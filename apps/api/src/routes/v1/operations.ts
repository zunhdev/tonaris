// Admin → Operations (TS-115): the jobs that gave up, and a test error to check the reports with, for the creator
// only. Backups are Render's (TS-112), so their status is on Render's dashboard, not here.

import { Elysia } from "elysia";
import { z } from "zod";

import { operationsStatus, type Database } from "@tonaris/db";
import { problemSchema } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { noFields, requireCreator } from "./common";

const operationsSchema = z
  .object({
    failedJobs: z
      .array(
        z.object({
          id: z.uuid(),
          kind: z.string(),
          attempts: z.int().nonnegative(),
          lastError: z.string().nullable().meta({ description: "Redacted as the logs are." }),
          deadAt: z.iso.datetime(),
        }),
      )
      .meta({ description: "The 50 latest jobs that gave up after their retries, newest first." }),
  })
  .meta({ description: "The service's health, for the creator (TS-115)." });

/** What the test error says: a fake address and token, which must reach the logs and Sentry redacted. */
export const testErrorMessage =
  "Tonaris test error for anna@example.com with Bearer test-token-0123456789 (TS-115)";

export function operationsRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .post(
      "/admin/operations/test-error",
      {
        signedIn: true,
        body: noFields,
        response: {
          401: problemSchema,
          403: problemSchema,
          422: problemSchema,
          500: problemSchema,
        },
        detail: {
          summary: "Send a test error",
          description:
            "Fails on purpose, with a fake email address and token in its message, so the creator can check that errors reach the logs and Sentry redacted (TS-115). Creator only.",
          tags: ["admission"],
          operationId: "sendTestError",
        },
      },
      ({ principal }) => {
        requireCreator(principal);
        throw new Error(testErrorMessage);
      },
    )
    .get(
      "/admin/operations",
      {
        signedIn: true,
        response: { 200: operationsSchema, 401: problemSchema, 403: problemSchema },
        detail: {
          summary: "Show the service's health",
          description: "The jobs that gave up after their retries. Creator only (TS-115).",
          tags: ["admission"],
          operationId: "getOperations",
        },
      },
      async ({ principal }) => {
        requireCreator(principal);
        const status = await operationsStatus(db);
        return {
          failedJobs: status.failedJobs.map(({ id, kind, attempts, lastError, deadAt }) => ({
            id,
            kind,
            attempts,
            lastError,
            deadAt: deadAt.toISOString(),
          })),
        };
      },
    );
}
