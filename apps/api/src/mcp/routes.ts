// POST /mcp (TS-60, TS-61): the MCP endpoint, for the 2026-07-28 protocol and, through the SDK's stateless
// fallback, 2025-era clients. A request needs an access token bound to `/mcp`; without one it gets a 401 whose
// WWW-Authenticate points to the resource metadata, which is how clients start sign-in. The token's connection
// must still exist, so revoking one takes effect at once, and its mode is what both grant (TS-62). Each call records
// when the connection was last used, for Settings (DS-86).

import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { APIError } from "better-auth/api";
import {
  createDpopReplayStore,
  type DpopReplayStore,
  enforceDpopBinding,
  isDpopBindingError,
  parseAccessTokenAuthorization,
  verifyJwsAccessToken,
} from "better-auth/oauth2";
import { Elysia } from "elysia";
import { errors as joseErrors, type JWTPayload } from "jose";

import { type Database, findConnection, recordConnectionUse } from "@tonaris/db";
import { mcpModeOf, type McpPrincipal } from "@tonaris/domain";

import { type Auth, mcpRequestedScopes, mcpResource } from "../auth/auth";
import type { ApiConfig } from "../config";
import type { LogError } from "../observability";
import type { Mutations } from "../sync/runner";
import { createMcpLimiter, mcpLimits, type McpLimiter } from "./limits";
import { createMcpServer } from "./server";
import { mcpWriter } from "./writes";

export type McpRoutesOptions = {
  auth: Auth;
  db: Database;
  config: Pick<ApiConfig, "apiOrigin" | "webOrigin">;
  logError: LogError;
  /** Runs agents' writes as the app's run, and hands their changes to the same streams (X-02, X-08). */
  mutations: Mutations;
  /** The per-connection limits (TS-66); a test may pass its own clock. */
  limiter?: McpLimiter;
};

const unauthorized = (message: string, error?: string) =>
  new APIError(
    "UNAUTHORIZED",
    error ? { message, error, error_description: message } : { message },
  );

/**
 * Checks the request's access token as `requireMcpAuth` from `@better-auth/mcp` does: signature, issuer,
 * audience `/mcp`, expiry, `azp`, and the DPoP binding of a sender-constrained token. The difference is the
 * keys: `requireMcpAuth` fetches the JWKS over HTTP from the API's own public URL, while the API holds them.
 */
function tokenVerifier(auth: Auth, { issuer, resource }: { issuer: string; resource: string }) {
  const jwksCacheKey = {};
  // On first use: Better Auth initializes its plugins with the context, which writes to the database.
  let replayStore: Promise<DpopReplayStore> | undefined;
  const dpopReplayStore = () =>
    (replayStore ??= auth.$context.then((context) =>
      createDpopReplayStore(context.internalAdapter),
    ));

  return async (request: Request): Promise<{ token: string; claims: JWTPayload }> => {
    const authorization = parseAccessTokenAuthorization(request.headers.get("authorization"));
    if (!authorization?.token) throw unauthorized("missing authorization header");
    if (authorization.scheme === "Unknown") {
      throw unauthorized("authorization scheme must be Bearer or DPoP", "invalid_token");
    }
    let claims: JWTPayload;
    try {
      claims = await verifyJwsAccessToken(authorization.token, {
        jwksFetch: () => auth.api.getJwks(),
        jwksCacheKey,
        verifyOptions: { issuer, audience: resource, requiredClaims: ["azp"] },
      });
    } catch (error) {
      // A malformed token fails as a TypeError; anything else, such as the database, is the server's.
      if (error instanceof joseErrors.JOSEError || error instanceof TypeError) {
        throw unauthorized("invalid access token");
      }
      throw error;
    }
    try {
      await enforceDpopBinding({
        payload: claims,
        authorization,
        proofJwt: request.headers.get("dpop"),
        method: request.method,
        url: request.url,
        replayStore: await dpopReplayStore(),
      });
    } catch (error) {
      if (isDpopBindingError(error)) throw unauthorized(error.message, error.code);
      throw error;
    }
    return { token: authorization.token, claims };
  };
}

/** A JSON-RPC error carrying the challenge, as `@better-auth/mcp` answers. */
function challengeResponse(
  challenge: NonNullable<ReturnType<typeof createResourceServerChallenge>>,
): Response {
  const headers = new Headers(challenge.headers);
  headers.set("content-type", "application/json");
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: challenge.message },
      id: null,
    }),
    { status: challenge.statusCode, headers },
  );
}

/** A JSON-RPC error for a connection with too many requests in flight: the client may send it again in a second. */
function tooManyAtOnce(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Too many requests at once from this connection: at most ${mcpLimits.concurrent}. Wait for one to finish.`,
      },
      id: null,
    }),
    { status: 429, headers: { "content-type": "application/json", "retry-after": "1" } },
  );
}

/** The scopes in a token's `scope` claim. */
function scopesOf(claim: unknown): string[] {
  return typeof claim === "string" ? claim.split(" ").filter(Boolean) : [];
}

/** The principal from the fields `mcpRoutes` puts in `authInfo.extra` after checking the token. */
function principalOf(extra: Record<string, unknown> = {}): McpPrincipal {
  const { userId, grantId, mode } = extra;
  if (typeof userId !== "string" || typeof grantId !== "string") {
    throw new Error("An MCP request reached the server without its principal.");
  }
  if (mode !== "read_only" && mode !== "manage")
    throw new Error(`Unknown MCP mode: ${String(mode)}`);
  return { kind: "mcp", userId, grantId, mode };
}

export function mcpRoutes({
  auth,
  db,
  config,
  logError,
  mutations,
  limiter = createMcpLimiter(),
}: McpRoutesOptions) {
  const resource = mcpResource(config.apiOrigin);
  const verify = tokenVerifier(auth, { issuer: `${config.apiOrigin}/auth`, resource });
  const challenge = (error: unknown) => {
    // Clients ask for the scopes the challenge names: both modes', so consent can offer either, and
    // `offline_access` for a refresh token. ChatGPT asks for nothing else, and without it would sign in again every
    // hour (TON-22).
    const response = createResourceServerChallenge(error, resource, {
      challengeScopes: mcpRequestedScopes,
    });
    if (!response) throw error;
    return challengeResponse(response);
  };

  const writer = mcpWriter({ db, mutations });
  const handler = createMcpHandler(
    ({ authInfo }) =>
      createMcpServer({
        db,
        principal: principalOf(authInfo?.extra),
        limiter,
        writer,
        webOrigin: config.webOrigin,
      }),
    { onerror: (error) => logError(error, "MCP request") },
  );

  async function serve(request: Request): Promise<Response> {
    let verified: Awaited<ReturnType<typeof verify>>;
    try {
      verified = await verify(request);
    } catch (error) {
      return challenge(error);
    }
    const { token, claims } = verified;
    const userId = claims.sub;
    const clientId = typeof claims.azp === "string" ? claims.azp : undefined;
    const connection =
      userId && clientId ? await findConnection(db, { userId, clientId }) : undefined;
    const tokenScopes = scopesOf(claims.scope);
    // The connection holds the mode chosen most recently; a token never exceeds it.
    const mode =
      connection && mcpModeOf(connection.scopes.filter((scope) => tokenScopes.includes(scope)));
    if (!userId || !clientId || !connection || !mode) {
      return challenge(unauthorized("This connection was revoked.", "invalid_token"));
    }
    await recordConnectionUse(db, connection);

    // At most four requests in flight per connection (TS-66).
    const release = limiter.enter(connection.id);
    if (!release) return tooManyAtOnce();
    try {
      return await handler.fetch(request, {
        authInfo: {
          token,
          clientId,
          scopes: tokenScopes,
          expiresAt: claims.exp,
          resource: new URL(resource),
          extra: { userId, grantId: connection.id, mode },
        },
      });
    } finally {
      release();
    }
  }

  return new Elysia().all("/mcp", { parse: "none", detail: { hide: true } }, ({ request }) =>
    serve(request),
  );
}
