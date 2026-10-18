// Start's request pipeline (TS-03): every response gets the security headers (TS-101), with a fresh CSP nonce
// that the router renders onto its scripts and styles (`getRouter`).

import { createMiddleware, createStart } from "@tanstack/react-start";

import { apiUrl } from "./config";
import { createNonce, securityHeaders } from "./security/headers";

const apiOrigin = new URL(apiUrl).origin;

const securityHeadersMiddleware = createMiddleware().server(async ({ next, pathname }) => {
  const nonce = createNonce();
  const result = await next({ context: { nonce } });
  for (const [name, value] of Object.entries(securityHeaders({ nonce, apiOrigin, pathname }))) {
    result.response.headers.set(name, value);
  }
  return result;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
}));

// Types the request context (the nonce) for `getGlobalStartContext()`. Start's route-tree generator writes this
// registration only when it sees this file at generation time, which the committed tree doesn't reflect.
declare module "@tanstack/react-start" {
  interface Register {
    config: Awaited<ReturnType<typeof startInstance.getOptions>>;
  }
}
