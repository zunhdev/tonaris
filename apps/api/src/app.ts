// The tonaris-api Elysia app (TS-01, TS-04). Routes stay thin: business rules live in packages/domain.
// This module has no side effects; src/index.ts connects the database and email and listens. The web app imports
// `type App` from here for its Eden client, types only (TS-29).

import { Elysia } from "elysia";
import { z } from "zod";

import type { Database } from "@tonaris/db";
import type { EmailPort } from "@tonaris/domain";

import { admissionRoutes } from "./auth/admission";
import type { Auth } from "./auth/auth";
import { authRoutes, sessionGuard, type SessionGuard } from "./auth/plugin";
import { createSignInLimiter, type SignInLimiter } from "./auth/sign-in-limits";
import type { CaptureDeps } from "./capture";
import { compression } from "./compression";
import type { ApiConfig } from "./config";
import { webCors } from "./cors";
import { mcpRoutes } from "./mcp/routes";
import { openApiJson } from "./openapi";
import { problemDetails, type ProblemDetailsOptions } from "./problem";
import { approvalRoutes } from "./routes/v1/approvals";
import { connectionRoutes } from "./routes/v1/connections";
import { meRoutes } from "./routes/v1/me";
import { csrfGuard, securityHeaders } from "./security";
import { databaseHub, type SyncHub } from "./sync/hub";
import { syncRoutes } from "./sync/routes";

export const healthSchema = z
  .object({ status: z.literal("ok") })
  .meta({ description: "The API is up." });

/** The versioned contract (TS-09): additive changes only within /v1. */
function v1(
  session: SessionGuard,
  sync: { db: Database; hub: SyncHub; capture?: CaptureDeps | undefined },
) {
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
    .use(meRoutes(session))
    .use(connectionRoutes(session, { db: sync.db }))
    .use(approvalRoutes(session, { db: sync.db }))
    .use(syncRoutes(session, sync));
}

export type AppOptions = ProblemDetailsOptions & {
  config: ApiConfig;
  auth: Auth;
  db: Database;
  /** Sends what Better Auth doesn't: the codes that create invited accounts (TS-71). */
  email: EmailPort;
  /** The change bus the streams listen on; the default serves this process (TS-23). Close it on shutdown. */
  hub?: SyncHub;
  /** The sign-in limits; the default holds the TS-104 limits for this process. */
  limiter?: SignInLimiter;
  /** What captures ask (TS-41); without it, a capture fails as `provider_unavailable`. */
  capture?: CaptureDeps | undefined;
};

export function createApp({
  config,
  auth,
  db,
  email,
  hub = databaseHub(db),
  limiter = createSignInLimiter(),
  capture,
  ...problemOptions
}: AppOptions) {
  const logError =
    problemOptions.logError ??
    ((error: unknown, context: string) => console.error(`Failed: ${context}`, error));
  return (
    new Elysia({ name: "tonaris-api" })
      .use(problemDetails(problemOptions))
      .use(securityHeaders())
      // Before the routes, so it sees every response they give (TS-120).
      .use(compression())
      // CORS answers preflights before the CSRF rule looks at a request.
      .use(webCors(config))
      .use(csrfGuard(config))
      // The host's health check (TS-110), outside the versioned contract.
      .get("/healthz", { detail: { hide: true } }, () => "ok")
      .use(admissionRoutes({ auth, db, config, email, limiter, logError }))
      .use(authRoutes({ auth, limiter, clientIpHeader: config.clientIpHeader }))
      .use(mcpRoutes({ auth, db, config, logError }))
      .use(v1(sessionGuard(auth), { db, hub, capture }))
  );
}

export type App = ReturnType<typeof createApp>;
