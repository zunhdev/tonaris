// The API's security baseline (TS-101, TS-102): headers on every response, and the CSRF rule for cookie-carrying
// writes. CORS lives in cors.ts.

import { Elysia } from "elysia";

import type { ApiConfig } from "./config";
import { ProblemError } from "./problem";

/** The API serves data, never documents: nothing may load, run or frame what it returns (TS-101). */
const responseHeaders = {
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

export function securityHeaders() {
  return new Elysia({ name: "security-headers" }).onRequest(({ set }) => {
    Object.assign(set.headers, responseHeaders);
  });
}

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

/** Whether the request authenticates with a bearer token, which makes it ignore cookies (TS-102). */
export function hasBearerToken(request: Request): boolean {
  return /^bearer\s/i.test(request.headers.get("authorization") ?? "");
}

function isJson(contentType: string | null): boolean {
  return /^application\/json\s*(;|$)/i.test(contentType ?? "");
}

/**
 * The OAuth endpoints MCP clients post forms to (RFC 6749, RFC 7009). They authenticate the client and its
 * code or token and never read the session, so the CSRF rule has nothing to protect there.
 */
const oauthFormEndpoints = new Set(["/auth/oauth2/token", "/auth/oauth2/revoke"]);

/**
 * CSRF (TS-102). A POST under /v1 or /auth must send JSON, which a cross-site HTML form can't, and which makes
 * browsers preflight it so CORS decides. Other write methods (DELETE, PATCH, PUT) are always preflighted, with
 * or without a body. A write that carries cookies must also come from the web origin. On /v1, a bearer request
 * is authenticated by its token alone, so its cookies grant nothing and the origin doesn't matter. GET requests
 * never change anything, and the OAuth form endpoints never use cookies, so they pass.
 */
export function csrfGuard({ webOrigin }: Pick<ApiConfig, "webOrigin">) {
  return new Elysia({ name: "csrf-guard" }).onRequest(({ request }) => {
    const { pathname } = new URL(request.url);
    const isV1 = pathname.startsWith("/v1/");
    if (!isV1 && !pathname.startsWith("/auth/")) return;
    if (safeMethods.has(request.method) || oauthFormEndpoints.has(pathname)) return;

    if (request.method === "POST" && !isJson(request.headers.get("content-type"))) {
      throw new ProblemError(
        415,
        "validation_failed",
        "Send the request body as application/json.",
      );
    }
    const usesCookies = request.headers.has("cookie") && !(isV1 && hasBearerToken(request));
    if (usesCookies && request.headers.get("origin") !== webOrigin) {
      throw new ProblemError(
        403,
        "permission_denied",
        "Requests that use the session cookie are only accepted from the Tonaris web app.",
      );
    }
  });
}
