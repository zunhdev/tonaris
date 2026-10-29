// Admin → Operations (TS-115): the jobs that gave up and the age of the last operator backup, and a test error to
// check the reports with, for the creator only.

import { Elysia } from "elysia";
import { z } from "zod";

import { operationsStatus, type Database } from "@tonaris/db";
import { problemSchema } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { requireCreator } from "./admissions";

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
    lastBackup: z
      .object({
        finishedAt: z.iso.datetime(),
        objectKey: z.string(),
        bytes: z.int().nonnegative(),
      })
      .nullable()
      .meta({
        description: "The last successful operator backup (TS-112); null before the first.",
      }),
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
        body: z.object({}).meta({ description: "No fields." }),
        response: { 401: problemSchema, 403: problemSchema, 500: problemSchema },
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
          description:
            "The jobs that gave up after their retries, and when the last operator backup finished. Creator only (TS-115).",
          tags: ["admission"],
          operationId: "getOperations",
        },
      },
      async ({ principal }) => {
        requireCreator(principal);
        const status = await operationsStatus(db);
        return {
          failedJobs: status.failedJobs.map((job) => ({
            ...job,
            deadAt: job.deadAt.toISOString(),
          })),
          lastBackup: status.lastBackup && {
            ...status.lastBackup,
            finishedAt: status.lastBackup.finishedAt.toISOString(),
          },
        };
      },
    );
}
