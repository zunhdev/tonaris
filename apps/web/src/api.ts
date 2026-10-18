// The web app's typed API client: Eden treaty over the API's `type App` (TS-29). The import is type-only,
// so no server code reaches the web bundle; oxlint rejects value imports from @tonaris/api.

import { treaty } from "@elysia/eden";

import type { App } from "@tonaris/api";

import { apiUrl } from "./config";

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * `baseUrl` is the API origin: `API_INTERNAL_URL` on the server (TS-03), the public API URL in the browser.
 * Requests carry the session cookie, which the API accepts from the web origin only (TS-08, TS-102).
 */
export function createApiClient(baseUrl: string, options: { fetcher?: typeof fetch } = {}) {
  return treaty<App>(baseUrl, { fetcher: options.fetcher, fetch: { credentials: "include" } });
}

/** The browser's client. */
export const api = createApiClient(apiUrl);
