// The tonaris-api Elysia app (TS-01, TS-04). Routes stay thin: business rules live in packages/domain.
// This module has no side effects; src/index.ts listens. The web app imports `type App` from here for its
// Eden client, types only (TS-29).

import { Elysia } from "elysia";
import { z } from "zod";

import { openApiJson } from "./openapi";
import { problemDetails, type ProblemDetailsOptions } from "./problem";

export const healthSchema = z
  .object({ status: z.literal("ok") })
  .meta({ description: "The API is up." });

/** The versioned contract (TS-09): additive changes only within /v1. */
function v1() {
  return new Elysia({ prefix: "/v1" }).use(openApiJson).get(
    "/health",
    {
      response: healthSchema,
      detail: { summary: "Check that the API is up", tags: ["system"], operationId: "getHealth" },
    },
    () => ({ status: "ok" as const }),
  );
}

export function createApp(options: ProblemDetailsOptions = {}) {
  return (
    new Elysia({ name: "tonaris-api" })
      .use(problemDetails(options))
      // The host's health check (TS-110), outside the versioned contract.
      .get("/healthz", { detail: { hide: true } }, () => "ok")
      .use(v1())
  );
}

export type App = ReturnType<typeof createApp>;
