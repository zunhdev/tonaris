// The tonaris-api Elysia app (TS-01, TS-04). Routes stay thin: business rules live in packages/domain.
// This module has no side effects; src/index.ts connects the database and email and listens. The web app imports
// `type App` from here for its Eden client, types only (TS-29).

import { Elysia } from "elysia";
import { z } from "zod";

import type { Database } from "@tonaris/db";
import type { EmailPort } from "@tonaris/domain";

import { accountDeletionProgressRoutes } from "./auth/account-deletion";
import { admissionRoutes } from "./auth/admission";
import type { Auth } from "./auth/auth";
import { authRoutes, sessionGuard, type SessionGuard } from "./auth/plugin";
import { recoveryRoutes } from "./auth/recovery";
import { createSignInLimiter, type SignInLimiter } from "./auth/sign-in-limits";
import type { CaptureDeps } from "./capture";
import { compression } from "./compression";
import type { ApiConfig } from "./config";
import { webCors } from "./cors";
import { artworkRoutes, artworkSigner, type ArtworkSigner, type ImageFetch } from "./img/artwork";
import type { McpLimiter } from "./mcp/limits";
import { mcpRoutes } from "./mcp/routes";
import type { LogError } from "./observability";
import { openApiJson } from "./openapi";
import { problemDetails, type ProblemDetailsOptions } from "./problem";
import { accountDeletionRoutes } from "./routes/v1/account-deletion";
import { admissionAdminRoutes } from "./routes/v1/admissions";
import { approvalRoutes } from "./routes/v1/approvals";
import { connectionRoutes } from "./routes/v1/connections";
import { coverRoutes, type CoverFinder } from "./routes/v1/covers";
import { emailChangeRoutes } from "./routes/v1/email-change";
import { exportRoutes } from "./routes/v1/export";
import { fieldRoutes } from "./routes/v1/fields";
import { guestRoutes } from "./routes/v1/guests";
import { invitationRoutes } from "./routes/v1/invitations";
import { meRoutes } from "./routes/v1/me";
import { memberAdminRoutes } from "./routes/v1/members";
import { operationsRoutes } from "./routes/v1/operations";
import { passkeyRoutes } from "./routes/v1/passkeys";
import { searchRoutes } from "./routes/v1/search";
import { sharedRoutes } from "./routes/v1/shared";
import { sharingRoutes } from "./routes/v1/sharing";
import { supportRoutes } from "./routes/v1/support";
import { csrfGuard, securityHeaders } from "./security";
import { databaseHub, type SyncHub } from "./sync/hub";
import { syncRoutes } from "./sync/routes";
import { announcer, mutationRunner, type Mutations } from "./sync/runner";

/**
 * The largest request body the API reads (TON-95), passed to `listen`. The largest legitimate request, a 200-item
 * batch of 2,000-character text values (TS-18), is about 1.7 MB in UTF-8; Bun's default would read 128 MB.
 */
export const maxRequestBodySize = 4 * 1024 * 1024;

export const healthSchema = z
  .object({
    status: z.literal("ok"),
    commit: z.string().optional().meta({
      description:
        "The commit the running API was built from, when the host says: the web app's deploy waits for it (TS-01).",
    }),
  })
  .meta({ description: "The API is up." });

/** The versioned contract (TS-09): additive changes only within /v1. Each resource gets what it uses. */
function v1(
  session: SessionGuard,
  deps: {
    config: Pick<
      ApiConfig,
      "authSecret" | "webOrigin" | "supportEmail" | "clientIpHeader" | "commit"
    >;
    db: Database;
    hub: SyncHub;
    mutations: Mutations;
    /** Sends invitations, recoveries and email changes' codes (TS-72). */
    email: EmailPort;
    limiter: SignInLimiter;
    wakeJobs: () => void;
    covers?: CoverFinder | undefined;
    artwork: ArtworkSigner;
    logError: LogError;
  },
) {
  const { config, db, hub, mutations, email, limiter, wakeJobs, covers, artwork, logError } = deps;
  const { webOrigin, clientIpHeader, commit } = config;
  return new Elysia({ prefix: "/v1" })
    .use(openApiJson)
    .get(
      "/health",
      {
        response: healthSchema,
        detail: { summary: "Check that the API is up", tags: ["system"], operationId: "getHealth" },
      },
      () => ({ status: "ok" as const, ...(commit ? { commit } : {}) }),
    )
    .use(supportRoutes({ supportEmail: config.supportEmail }))
    .use(meRoutes(session, { db }))
    .use(emailChangeRoutes(session, { db, email, limiter, clientIpHeader }))
    .use(accountDeletionRoutes(session, { db, wakeJobs, notify: (id) => hub.notify(id) }))
    .use(connectionRoutes(session, { db }))
    .use(passkeyRoutes(session, { db }))
    .use(approvalRoutes(session, { db }))
    .use(fieldRoutes(session, { db }))
    .use(searchRoutes(session, { db }))
    .use(coverRoutes(session, { covers, artwork }))
    .use(exportRoutes(session, { db }))
    .use(sharingRoutes(session, { db, shareSecret: config.authSecret, webOrigin }))
    .use(invitationRoutes(session, { db }))
    .use(admissionAdminRoutes(session, { db, email, webOrigin, logError }))
    .use(memberAdminRoutes(session, { db, email, webOrigin }))
    .use(operationsRoutes(session, { db }))
    .use(sharedRoutes(session, { db, hub, artwork }))
    .use(guestRoutes({ db, hub, artwork }))
    .use(syncRoutes(session, { db, hub, artwork, mutations }));
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
  /** Wakes the job worker after queueing a job, such as an account's deletion (TS-90); it polls otherwise. */
  wakeJobs?: () => void;
  /** What captures ask (TS-41); without it, a capture fails as `provider_unavailable`. */
  capture?: CaptureDeps | undefined;
  /** How the image proxy fetches artwork: `safeFetch` unless a test stands in (TS-103). */
  imageFetch?: ImageFetch | undefined;
  /** Find artwork's search (TON-112); without it, the search answers `provider_unavailable`. */
  covers?: CoverFinder | undefined;
  /** MCP's per-connection limits; the default holds the TS-66 limits for this process. */
  mcpLimiter?: McpLimiter | undefined;
};

export function createApp({
  config,
  auth,
  db,
  email,
  hub = databaseHub(db),
  limiter = createSignInLimiter(),
  wakeJobs = () => {},
  capture,
  imageFetch,
  covers,
  mcpLimiter,
  ...problemOptions
}: AppOptions) {
  const artwork = artworkSigner(config.authSecret);
  const logError: LogError =
    problemOptions.logError ?? ((error, context) => console.error(`Failed: ${context}`, error));
  // One path for every write, from the app and MCP alike (X-02).
  const mutations: Mutations = {
    run: mutationRunner(db, {
      capture,
      shareSecret: config.authSecret,
      email,
      webOrigin: config.webOrigin,
      logError,
    }),
    announce: announcer(hub),
  };
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
      .use(recoveryRoutes({ db, limiter, clientIpHeader: config.clientIpHeader }))
      .use(accountDeletionProgressRoutes({ db, wakeJobs }))
      .use(authRoutes({ auth, limiter, clientIpHeader: config.clientIpHeader }))
      .use(
        mcpRoutes({
          auth,
          db,
          config,
          logError,
          mutations,
          ...(mcpLimiter ? { limiter: mcpLimiter } : {}),
        }),
      )
      // Artwork, outside the versioned contract: images the server signed (TS-103).
      .use(artworkRoutes(artwork, imageFetch ? { fetch: imageFetch } : {}))
      .use(
        v1(sessionGuard(auth), {
          config,
          db,
          hub,
          mutations,
          email,
          limiter,
          wakeJobs,
          covers,
          artwork,
          logError,
        }),
      )
  );
}

export type App = ReturnType<typeof createApp>;
