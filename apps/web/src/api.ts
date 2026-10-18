// The web app's typed API client: Eden treaty over the API's `type App` (TS-29). The import is type-only,
// so no server code reaches the web bundle; oxlint rejects value imports from @tonaris/api.

import { treaty } from "@elysia/eden";

import type { App } from "@tonaris/api";

export type ApiClient = ReturnType<typeof createApiClient>;

/** `baseUrl` is the API origin: `API_INTERNAL_URL` on the server (TS-03), the public API URL in the browser. */
export function createApiClient(baseUrl: string, options: { fetcher?: typeof fetch } = {}) {
  return treaty<App>(baseUrl, { fetcher: options.fetcher });
}
