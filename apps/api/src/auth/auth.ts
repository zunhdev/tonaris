// Sign-in with Better Auth (TS-70): an emailed 6-digit code, or the link carrying it, opens a 30-day web session
// whose cookie both hosts see (TS-08). Sign-in never creates an account (FR-11.2): an unknown address gets an
// email saying so instead of a code, and the response is the same either way (DS-90).

import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { memoryAdapter } from "better-auth/adapters/memory";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, jwt } from "better-auth/plugins";

import {
  authAccounts,
  type Database,
  jwks,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  sessions,
  users,
  verifications,
} from "@tonaris/db";
import { emailKey, type EmailPort, mcpScopes, signInCode, userRoles } from "@tonaris/domain";

import type { ApiConfig } from "../config";
import { recordingTransactions } from "./transaction";

const day = 24 * 60 * 60;

/** The MCP endpoint (TS-60): the protected resource every MCP token is bound to (RFC 8707). */
export function mcpResource(apiOrigin: string): string {
  return `${apiOrigin}/mcp`;
}

/**
 * The scopes MCP clients ask for: both modes' (TS-61), and `offline_access` for a refresh token. The consent
 * page grants what the person chooses (`mcpScopesFor`).
 */
export const mcpRequestedScopes = [mcpScopes.read, mcpScopes.manage, "offline_access"] as const;

/** The Better Auth endpoints that take an email; the address is replaced by its email key before they run. */
const requestCodePath = "/email-otp/send-verification-otp";
const signInPath = "/sign-in/email-otp";

/** Better Auth's models, for the in-memory store (`db: "in-memory"`). */
const memoryModels = [
  "user",
  "session",
  "account",
  "verification",
  "jwks",
  "oauthClient",
  "oauthResource",
  "oauthClientResource",
  "oauthConsent",
  "oauthRefreshToken",
  "oauthAccessToken",
  "oauthClientAssertion",
];

export type AuthOptions = {
  config: ApiConfig;
  /**
   * Where Better Auth keeps its rows. `in-memory` is for an app that serves no requests, such as the OpenAPI
   * generator's: the OAuth provider writes its resource row at start-up, and that must not reach a database.
   */
  db: Database | "in-memory";
  email: EmailPort;
  /** Receives failures of work done after the response, such as sending email (default: `console.error`). */
  logError?: (error: unknown, context: string) => void;
  /**
   * `Secure` cookies with the `__Secure-` prefix (default). Only the browser tests' WebKit run turns it off:
   * Playwright's WebKit keeps no `Secure` cookie on `http://localhost` (TON-94). Every served API keeps it on.
   */
  secureCookies?: boolean;
  /**
   * Fetches a client's metadata document (CIMD). The default resolves the host once, refuses private
   * addresses, pins the connection and never follows redirects; tests serve documents from memory.
   */
  fetchClientMetadata?: ClientMetadataResourceFetch;
};

/** The verify page link (DS-90). The code sits in the fragment, so it never reaches a server log or `Referer`. */
export function signInLink(webOrigin: string, email: string, code: string): string {
  return `${webOrigin}/sign-in/verify?email=${encodeURIComponent(email)}#code=${code}`;
}

export function createAuth({
  config,
  db,
  email,
  logError = (error, context) => console.error(`Failed: ${context}`, error),
  fetchClientMetadata = fetchClientMetadataResource,
  secureCookies = true,
}: AuthOptions) {
  return betterAuth({
    appName: "Tonaris",
    baseURL: config.apiOrigin,
    basePath: "/auth",
    secret: config.authSecret,
    // Better Auth checks the Origin of cookie-carrying requests against these.
    trustedOrigins: [config.webOrigin],
    database:
      db === "in-memory"
        ? memoryAdapter(Object.fromEntries(memoryModels.map((model) => [model, []])))
        : drizzleAdapter(recordingTransactions(db), {
            provider: "pg",
            // Real transactions, which admission joins with its own queries (transaction.ts, TS-71).
            transaction: true,
            schema: {
              user: users,
              session: sessions,
              account: authAccounts,
              verification: verifications,
              jwks,
              oauthClient: oauthClients,
              oauthResource: oauthResources,
              oauthClientResource: oauthClientResources,
              oauthConsent: oauthConsents,
              oauthRefreshToken: oauthRefreshTokens,
              oauthAccessToken: oauthAccessTokens,
              oauthClientAssertion: oauthClientAssertions,
            },
          }),
    user: {
      fields: { name: "displayName" },
      additionalFields: {
        role: { type: [...userRoles], required: true, defaultValue: "user", input: false },
        // The terms' version the person agreed to (TON-131), set only by joining and `POST /v1/me/terms`.
        termsVersion: { type: "string", required: false, input: false },
      },
    },
    // Rolling sessions: each day of use moves the expiry to 30 days from then (TS-70).
    session: { expiresIn: 30 * day, updateAge: day },
    emailAndPassword: { enabled: false },
    // Replaced by the sign-in limiter in front of these endpoints (sign-in-limits.ts).
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: "tonaris",
      // `__Secure-` and `Secure` locally too, so cookie behavior matches production (TS-06).
      useSecureCookies: secureCookies,
      crossSubDomainCookies: config.cookieDomain
        ? { enabled: true, domain: config.cookieDomain }
        : undefined,
      // Better Auth skips its origin checks when NODE_ENV is `test`; set them on so tests see production behavior.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: () => Bun.randomUUIDv7() },
      // Sessions store no IP addresses; the limiter keeps them in memory only.
      ipAddress: { disableIpTracking: true },
      // Email is queued after the response, so sending neither delays nor fails it (TS-90).
      backgroundTasks: {
        handler: (promise) =>
          void promise.catch((error) => logError(error, "auth background task")),
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== requestCodePath && ctx.path !== signInPath) return undefined;
        if (ctx.path === requestCodePath && ctx.body?.type !== "sign-in") {
          throw APIError.fromStatus("BAD_REQUEST", {
            message: "Only sign-in codes can be requested.",
          });
        }
        if (typeof ctx.body?.email !== "string") return undefined;
        return { context: { body: { ...ctx.body, email: emailKey(ctx.body.email) } } };
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== requestCodePath || ctx.context.returned instanceof Error) return;
        const address: string = ctx.body.email;
        if (await ctx.context.internalAdapter.findUserByEmail(address)) return;
        await ctx.context.runInBackgroundOrAwait(email.send("sign-in-no-account", address, {}));
      }),
    },
    plugins: [
      emailOTP({
        disableSignUp: true,
        otpLength: signInCode.length,
        expiresIn: signInCode.validMinutes * 60,
        allowedAttempts: signInCode.attempts,
        storeOTP: "hashed",
        // Called only for existing accounts, in the background.
        async sendVerificationOTP({ email: address, otp }) {
          await email.send("sign-in-code", address, {
            code: otp,
            link: signInLink(config.webOrigin, address, otp),
          });
        },
      }),
      // Signs MCP access tokens; JWKS at /auth/jwks. Sessions stay cookies, never JWTs.
      jwt({ disableSettingJwtHeader: true }),
      // The OAuth 2.1 authorization server for MCP (TS-61): access tokens are JWTs bound to `/mcp`, refresh
      // tokens rotate. Sign-in and consent are pages of the web app; DCR stays on as the fallback to CIMD.
      mcp({
        resource: mcpResource(config.apiOrigin),
        loginPage: `${config.webOrigin}/sign-in`,
        consentPage: `${config.webOrigin}/oauth/consent`,
        scopes: [...mcpRequestedScopes],
        // Tokens always act for a person; no machine-to-machine `client_credentials`.
        grantTypes: ["authorization_code", "refresh_token"],
        accessTokenExpiresIn: 60 * 60,
        refreshTokenExpiresIn: 30 * day,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // Native clients registering by DCR (older Codex or Claude Code) may leave `application_type` out.
        clientRegistrationDefaultApplicationType: "infer",
      }),
      // Client ID Metadata Documents (MCP 2026-07-28): what Claude, ChatGPT and Codex prefer.
      cimd({
        fetchClientMetadataResource: fetchClientMetadata,
        metadataProfile: "mcp-2026-07-28",
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
