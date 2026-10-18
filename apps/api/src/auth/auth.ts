// Sign-in with Better Auth (TS-70): an emailed 6-digit code, or the link carrying it, opens a 30-day web session
// whose cookie both hosts see (TS-08). Sign-in never creates an account (FR-11.2): an unknown address gets an
// email saying so instead of a code, and the response is the same either way (DS-90).

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";

import { authAccounts, type Database, sessions, users, verifications } from "@tonaris/db";
import { emailKey, type EmailPort, signInCode, userRoles } from "@tonaris/domain";

import type { ApiConfig } from "../config";

const day = 24 * 60 * 60;

/** The Better Auth endpoints that take an email; the address is replaced by its email key before they run. */
const requestCodePath = "/email-otp/send-verification-otp";
const signInPath = "/sign-in/email-otp";

export type AuthOptions = {
  config: ApiConfig;
  db: Database;
  email: EmailPort;
  /** Receives failures of work done after the response, such as sending email (default: `console.error`). */
  logError?: (error: unknown, context: string) => void;
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
}: AuthOptions) {
  return betterAuth({
    appName: "Tonaris",
    baseURL: config.apiOrigin,
    basePath: "/auth",
    secret: config.authSecret,
    // Better Auth checks the Origin of cookie-carrying requests against these.
    trustedOrigins: [config.webOrigin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: authAccounts,
        verification: verifications,
      },
    }),
    user: {
      fields: { name: "displayName" },
      additionalFields: {
        role: { type: [...userRoles], required: true, defaultValue: "user", input: false },
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
      useSecureCookies: true,
      crossSubDomainCookies: config.cookieDomain
        ? { enabled: true, domain: config.cookieDomain }
        : undefined,
      // Better Auth skips its origin checks when NODE_ENV is `test`; set them on so tests see production behavior.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: () => Bun.randomUUIDv7() },
      // Sessions store no IP addresses; the limiter keeps them in memory only.
      ipAddress: { disableIpTracking: true },
      // Email goes out after the response, so sending neither delays nor fails it.
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
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
