// Start's request pipeline (TS-03): every response gets the security headers (TS-101), with a fresh CSP nonce
// that the router renders onto its scripts and styles (`getRouter`). A signed-out visit to `/` goes to the landing
// page (TON-155).

import { createMiddleware, createStart } from "@tanstack/react-start";

import { apiUrl, sentryDsn } from "./config";
import { hasSessionCookie } from "./features/landing/session-cookie";
import { createNonce, securityHeaders } from "./security/headers";

const apiOrigin = new URL(apiUrl).origin;
// Sentry's ingest host, which the browser reports to when errors are reported (TS-115).
const reportOrigin = sentryDsn ? new URL(sentryDsn).origin : undefined;

const securityHeadersMiddleware = createMiddleware().server(async ({ next, pathname }) => {
  const nonce = createNonce();
  const result = await next({ context: { nonce } });
  for (const [name, value] of Object.entries(
    securityHeaders({ nonce, apiOrigin, reportOrigin, pathname }),
  )) {
    result.response.headers.set(name, value);
  }
  return result;
});

// Without a session cookie, `/` is answered with the landing page's address (DS-32, DS-120), so a first visit, a
// crawler and a link preview get the rendered page rather than the workspace's empty shell. With one, `/` stays the
// workspace's, which opens the last view; a cookie that turns out stale is sent on by the workspace instead.
const landingMiddleware = createMiddleware().server(({ next, request, pathname }) => {
  if (
    pathname !== "/" ||
    request.method !== "GET" ||
    hasSessionCookie(request.headers.get("cookie"))
  )
    return next();
  return new Response(null, {
    status: 302,
    headers: { location: `/welcome${new URL(request.url).search}`, "cache-control": "no-store" },
  });
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, landingMiddleware],
}));
