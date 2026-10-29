// The tonaris-api Elysia app (TS-01, TS-04). Routes stay thin: business rules live in packages/domain.
// This module has no side effects; src/index.ts connects the database and email and listens. The web app imports
// `type App` from here for its Eden client, types only (TS-29).

import { Elysia } from "elysia";
import { z } from "zod";

import type { Database } from "@tonaris/db";
import type { EmailPort } from "@tonaris/domain";

import { artworkRoutes, artworkSigner, type ArtworkSigner, type ImageFetch } from "./artwork";
import { accountDeletionProgressRoutes } from "./auth/account-deletion";
import { admissionRoutes } from "./auth/admission";
import type { Auth } from "./auth/auth";
import { authRoutes, sessionGuard, type SessionGuard } from "./auth/plugin";
import { recoveryRoutes } from "./auth/recovery";
import { createSignInLimiter, type SignInLimiter } from "./auth/sign-in-limits";
import type { CaptureDeps, SharingDeps } from "./capture";
import { compression } from "./compression";
import type { ApiConfig } from "./config";
import { webCors } from "./cors";
import { mcpRoutes } from "./mcp/routes";
import { openApiJson } from "./openapi";
import { problemDetails, type ProblemDetailsOptions } from "./problem";
import { accountDeletionRoutes, type AccountDeletionDeps } from "./routes/v1/account-deletion";
import { admissionAdminRoutes } from "./routes/v1/admissions";
import { approvalRoutes } from "./routes/v1/approvals";
import { connectionRoutes } from "./routes/v1/connections";
import { emailChangeRoutes, type EmailChangeDeps } from "./routes/v1/email-change";
import { fieldRoutes } from "./routes/v1/fields";
import { guestRoutes } from "./routes/v1/guests";
import { invitationRoutes } from "./routes/v1/invitations";
import { meRoutes } from "./routes/v1/me";
import { memberAdminRoutes } from "./routes/v1/members";
import { searchRoutes } from "./routes/v1/search";
import { sharedRoutes } from "./routes/v1/shared";
import { sharingRoutes } from "./routes/v1/sharing";
import { supportRoutes } from "./routes/v1/support";
import { csrfGuard, securityHeaders } from "./security";
import { databaseHub, type SyncHub } from "./sync/hub";
import { syncRoutes } from "./sync/routes";

export const healthSchema = z
  .object({ status: z.literal("ok") })
  .meta({ description: "The API is up." });

/** The versioned contract (TS-09): additive changes only within /v1. */
function v1(
  session: SessionGuard,
  sync: {
    db: Database;
    hub: SyncHub;
    capture?: CaptureDeps | undefined;
    artwork: ArtworkSigner;
    sharing: SharingDeps;
    emailChange: EmailChangeDeps;
    accountDeletion: AccountDeletionDeps;
    supportEmail: string;
  },
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
    .use(supportRoutes(sync))
    .use(meRoutes(session))
    .use(emailChangeRoutes(session, sync.emailChange))
    .use(accountDeletionRoutes(session, sync.accountDeletion))
    .use(connectionRoutes(session, { db: sync.db }))
    .use(approvalRoutes(session, { db: sync.db }))
    .use(fieldRoutes(session, { db: sync.db }))
    .use(searchRoutes(session, { db: sync.db }))
    .use(
      sharingRoutes(session, {
        db: sync.db,
        shareSecret: sync.sharing.shareSecret,
        webOrigin: sync.sharing.webOrigin,
      }),
    )
    .use(invitationRoutes(session, { db: sync.db }))
    .use(
      admissionAdminRoutes(session, {
        db: sync.db,
        email: sync.sharing.email,
        webOrigin: sync.sharing.webOrigin,
        logError: sync.sharing.logError,
      }),
    )
    .use(
      memberAdminRoutes(session, {
        db: sync.db,
        email: sync.sharing.email,
        webOrigin: sync.sharing.webOrigin,
      }),
    )
    .use(sharedRoutes(session, sync))
    .use(guestRoutes(sync))
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
  /** Wakes the job worker after queueing a job, such as an account's deletion (TS-90); it polls otherwise. */
  wakeJobs?: () => void;
  /** What captures ask (TS-41); without it, a capture fails as `provider_unavailable`. */
  capture?: CaptureDeps | undefined;
  /** How the image proxy fetches artwork: `safeFetch` unless a test stands in (TS-103). */
  imageFetch?: ImageFetch | undefined;
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
  ...problemOptions
}: AppOptions) {
  const artwork = artworkSigner(config.authSecret);
  const logError =
    problemOptions.logError ??
    ((error: unknown, context: string) => console.error(`Failed: ${context}`, error));
  const sharing = { shareSecret: config.authSecret, email, webOrigin: config.webOrigin, logError };
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
      .use(mcpRoutes({ auth, db, config, logError, hub, capture, sharing }))
      // Artwork, outside the versioned contract: images the server signed (TS-103).
      .use(artworkRoutes(artwork, imageFetch ? { fetch: imageFetch } : {}))
      .use(
        v1(sessionGuard(auth), {
          db,
          hub,
          capture,
          artwork,
          sharing,
          emailChange: { db, email, limiter, clientIpHeader: config.clientIpHeader },
          accountDeletion: { db, wakeJobs, notify: (accountId) => hub.notify(accountId) },
          supportEmail: config.supportEmail,
        }),
      )
  );
}

export type App = ReturnType<typeof createApp>;
