// The web app's typed API client: Eden treaty over the API's `type App` (TS-29). The import is type-only,
// so no server code reaches the web bundle; oxlint rejects value imports from @tonaris/api.

import { treaty } from "@elysia/eden";
import { getGlobalStartContext } from "@tanstack/react-start";

import type { App } from "@tonaris/api";
import { problemSchema } from "@tonaris/domain";

import { apiUrl, clientIpHeader } from "./config";
import { problemSentence } from "./features/sync/problems";

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * `baseUrl` is the API origin: `API_INTERNAL_URL` on the server (TS-03), the public API URL in the browser.
 * Requests carry the session cookie, which the API accepts from the web origin only (TS-08, TS-102).
 */
export function createApiClient(baseUrl: string, options: { fetcher?: typeof fetch } = {}) {
  return treaty<App>(baseUrl, { fetcher: options.fetcher, fetch: { credentials: "include" } });
}

/**
 * On the server, the visitor's address in the header the API reads it from, so the API's per-address limits, such as
 * guests' views (TS-104), count the visitor rather than this server. Nothing in the browser, whose requests arrive
 * with their own address.
 */
export function visitorHeaders(): Record<string, string> {
  const visitor = getGlobalStartContext()?.visitor;
  return clientIpHeader && visitor ? { [clientIpHeader]: visitor } : {};
}

/** The browser's client. */
export const api = createApiClient(apiUrl);

/** An API refusal's sentence (its problem's `detail`), `fallback` when it has none, or undefined without an error. */
export function refusalOf(error: { value: unknown } | null, fallback: string): string | undefined {
  if (!error) return undefined;
  return problemSentence(problemSchema.safeParse(error.value).data, fallback);
}
