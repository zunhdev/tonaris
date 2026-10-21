// The HTTP side of sign-in (TS-70, TS-30): Better Auth's endpoints at /auth/*, outside /v1 (TS-04), the OAuth
// discovery documents at /.well-known/* (TS-61), and the `signedIn` guard that turns a session cookie into the
// request's principal.

import { Elysia, NotFound } from "elysia";

import { emailKey, type Account, type Principal } from "@tonaris/domain";

import { ProblemError } from "../problem";
import { hasBearerToken } from "../security";
import type { Auth } from "./auth";
import type { SignInLimiter } from "./sign-in-limits";

/**
 * The only Better Auth endpoints the API serves: what sign-in and the OAuth authorization server for MCP need
 * (TS-61), and nothing else, so no upgrade or plugin exposes more (such as `/update-user`, which would change
 * the display name around /v1, or the JWT plugin's `/token`, which would sign a session).
 */
const exposedEndpoints = new Set([
  "POST /auth/email-otp/send-verification-otp",
  "POST /auth/sign-in/email-otp",
  "GET /auth/get-session",
  "POST /auth/sign-out",
  // OAuth 2.1 for MCP clients: authorization with PKCE, tokens, revocation, open registration (DCR), and the
  // keys that verify access tokens.
  "GET /auth/oauth2/authorize",
  "POST /auth/oauth2/token",
  "POST /auth/oauth2/revoke",
  "POST /auth/oauth2/register",
  "GET /auth/jwks",
  // The consent page (DS-85): the client's public details, and the person's decision.
  "GET /auth/oauth2/public-client",
  "POST /auth/oauth2/consent",
]);

/** The issuer's path under the API origin; RFC 8414 puts its metadata at `/.well-known/…/auth`. */
const issuerPath = "/auth";

/**
 * Discovery (TS-61): the protected resource's metadata (RFC 9728), for `/mcp` and for the origin, and the
 * authorization server's (RFC 8414). The origin-level copy serves clients of the 2025-03-26 revision, which
 * look there instead of under the issuer's path.
 */
const discoveryPaths = new Map([
  ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource"],
  ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource/mcp"],
  [
    `/.well-known/oauth-authorization-server${issuerPath}`,
    `/.well-known/oauth-authorization-server${issuerPath}`,
  ],
  [
    "/.well-known/oauth-authorization-server",
    `/.well-known/oauth-authorization-server${issuerPath}`,
  ],
]);

type Server = { requestIP(request: Request): { address: string } | null } | null;

/**
 * The client's address for the sign-in limits: the socket address, or the header the host's proxy sets
 * (`CLIENT_IP_HEADER`). `X-Forwarded-For` lists every hop; its last entry is the one the proxy saw.
 */
export function clientIp(
  request: Request,
  server: Server,
  header: string | undefined,
): string | undefined {
  const forwarded = header ? request.headers.get(header) : null;
  if (forwarded) {
    const address = header === "x-forwarded-for" ? forwarded.split(",").at(-1) : forwarded;
    return address?.trim() || undefined;
  }
  return server?.requestIP(request)?.address;
}

/** The email in a code request's JSON body, as its email key, if there is one. */
async function requestedEmail(request: Request): Promise<string | undefined> {
  const body: unknown = await request
    .clone()
    .json()
    .catch(() => undefined);
  if (typeof body !== "object" || body === null || !("email" in body)) return undefined;
  return typeof body.email === "string" ? emailKey(body.email) : undefined;
}

function rateLimited(
  retryAfterSeconds: number,
  detail = "Too many sign-in attempts. Try again later.",
): ProblemError {
  return new ProblemError(429, "rate_limited", detail, {
    "retry-after": String(retryAfterSeconds),
  });
}

export type AuthRoutesOptions = {
  auth: Auth;
  limiter: SignInLimiter;
  clientIpHeader: string | undefined;
};

/**
 * Serves the exposed endpoints, after the sign-in and registration limits, and the discovery documents; any
 * other /auth or /.well-known path is `not_found`.
 */
export function authRoutes({ auth, limiter, clientIpHeader }: AuthRoutesOptions) {
  return new Elysia()
    .all(
      "/auth/*",
      { parse: "none", detail: { hide: true } },
      async ({ request, server, path }) => {
        const endpoint = `${request.method} ${path}`;
        if (!exposedEndpoints.has(endpoint)) throw new NotFound();

        const ip = clientIp(request, server, clientIpHeader);
        if (endpoint === "POST /auth/oauth2/register") {
          const wait = limiter.clientRegistration(ip);
          if (wait !== undefined) {
            throw rateLimited(wait, "Too many client registrations. Try again later.");
          }
        }
        const wait =
          endpoint === "POST /auth/email-otp/send-verification-otp"
            ? limiter.codeRequest(await requestedEmail(request), ip)
            : endpoint === "POST /auth/sign-in/email-otp"
              ? limiter.codeSubmission(ip)
              : undefined;
        if (wait !== undefined) throw rateLimited(wait);

        return auth.handler(request);
      },
    )
    .get("/.well-known/*", { detail: { hide: true } }, ({ request, path }) => {
      const served = discoveryPaths.get(path);
      if (!served) throw new NotFound();
      return auth.handler(
        new Request(new URL(served, request.url).href, { headers: request.headers }),
      );
    });
}

/**
 * `signedIn: true` on a route requires a session and resolves `principal` (TS-30) and `account`. A renewed
 * session cookie is passed on, so the cookie rolls with the session (TS-70). Without a session, the route
 * answers 401 `unauthenticated`. A bearer request is judged by its token alone and never by cookies (TS-102).
 * MCP tokens are for /mcp only (TS-62) and native-app tokens don't exist yet (TS-30), so no token is valid here.
 */
export function sessionGuard(auth: Auth) {
  return new Elysia({ name: "session-guard" }).macro({
    signedIn: {
      async derive({ request, set }) {
        if (hasBearerToken(request)) {
          throw new ProblemError(401, "unauthenticated", "This token isn't valid for this API.");
        }
        const { headers, response: session } = await auth.api.getSession({
          headers: request.headers,
          returnHeaders: true,
        });
        const cookies = headers.getSetCookie();
        if (cookies.length > 0) set.headers["set-cookie"] = cookies;
        if (!session) {
          throw new ProblemError(401, "unauthenticated", "Sign in to continue.");
        }
        const { user } = session;
        const account: Account = {
          id: user.id,
          email: user.email,
          displayName: user.name || null,
          role: user.role === "creator" ? "creator" : "user",
        };
        const principal: Principal = {
          kind: "user",
          userId: user.id,
          role: account.role,
          client: "web",
        };
        return { principal, account };
      },
    },
  });
}

export type SessionGuard = ReturnType<typeof sessionGuard>;
