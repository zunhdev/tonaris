// The tonaris-api Elysia app (TS-01, TS-04). Routes stay thin: business rules live in packages/domain.
// This module has no side effects; src/index.ts connects the database and email and listens. The web app imports
// `type App` from here for its Eden client, types only (TS-29).

import { Elysia } from "elysia";
import { z } from "zod";

import type { Auth } from "./auth/auth";
import { authRoutes, sessionGuard, type SessionGuard } from "./auth/plugin";
import { createSignInLimiter, type SignInLimiter } from "./auth/sign-in-limits";
import type { ApiConfig } from "./config";
import { webCors } from "./cors";
import { openApiJson } from "./openapi";
import { problemDetails, type ProblemDetailsOptions } from "./problem";
import { meRoutes } from "./routes/v1/me";

export const healthSchema = z
  .object({ status: z.literal("ok") })
  .meta({ description: "The API is up." });

/** The versioned contract (TS-09): additive changes only within /v1. */
function v1(session: SessionGuard) {
  return new Elysia({ prefix: "/v1" })
    .use(openApiJson)
    .get(
      "/health",
      {
        response: healthSchema,
        detail: { summary: "Check that the API is up", tags: ["system"], operationId: "getHealth" },
      },
      () => ({ status: "ok" as const }),
    )
    .use(meRoutes(session));
}

export type AppOptions = ProblemDetailsOptions & {
  config: ApiConfig;
  auth: Auth;
  /** The sign-in limits; the default holds the TS-104 limits for this process. */
  limiter?: SignInLimiter;
};

export function createApp({
  config,
  auth,
  limiter = createSignInLimiter(),
  ...problemOptions
}: AppOptions) {
  return (
    new Elysia({ name: "tonaris-api" })
      .use(problemDetails(problemOptions))
      .use(webCors(config))
      // The host's health check (TS-110), outside the versioned contract.
      .get("/healthz", { detail: { hide: true } }, () => "ok")
      .use(authRoutes({ auth, limiter, clientIpHeader: config.clientIpHeader }))
      .use(v1(sessionGuard(auth)))
  );
}

export type App = ReturnType<typeof createApp>;
