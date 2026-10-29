// The web app's part in connecting an MCP client (TS-61): the API's authorization server sends the person here
// to sign in and to consent (DS-85), and the decision goes back to it.

import { apiUrl } from "@/config";

import { mcpScopes, mcpScopesFor, type McpMode } from "@tonaris/domain";

/** Parameters Better Auth adds to sign the requests it sends to the sign-in and consent pages. */
const signatureParams = new Set(["sig", "exp", "ba_iat", "ba_pl", "ba_param"]);

/**
 * Where sign-in continues when the authorization server sent the person to it: `/oauth/authorize` with the
 * client's original request, which hands it back to the API now that there is a session. Undefined for an
 * ordinary sign-in. The signature goes; the API checks the request again anyway.
 */
export function authorizeContinuation(search: string): string | undefined {
  const params = new URLSearchParams(search);
  if (!params.has("client_id") || !params.has("sig")) return undefined;
  for (const name of signatureParams) params.delete(name);
  // Signing in just now satisfied `prompt=login`; asking again would loop.
  const prompt = params
    .get("prompt")
    ?.split(" ")
    .filter((value) => value && value !== "login");
  if (prompt?.length) params.set("prompt", prompt.join(" "));
  else params.delete("prompt");
  return `/oauth/authorize?${params}`;
}

/** The API's authorization endpoint for the client request in `search`. */
export function authorizeUrl(search: string): string {
  return `${apiUrl}/auth/oauth2/authorize${search.startsWith("?") ? search : `?${search}`}`;
}

/** What the consent page shows about the client (DS-85). */
export type ConsentRequest = {
  clientId: string;
  /**
   * The client's domain: the host of its metadata document's URL, which is its ID (CIMD), and which the authorization
   * server fetched it from. Undefined for a client registered by DCR, whose ID is random.
   */
  clientDomain: string | undefined;
  /** The host the client gets the answer at. */
  redirectHost: string | undefined;
  /** The scopes the client asked for. */
  scopes: string[];
};

/** The host of `url`, if it is a URL with one. */
function hostOf(url: string | null, protocol?: string): string | undefined {
  try {
    const parsed = new URL(url ?? "");
    return protocol && parsed.protocol !== protocol ? undefined : parsed.host || undefined;
  } catch {
    return undefined;
  }
}

export function consentRequest(search: string): ConsentRequest {
  const params = new URLSearchParams(search);
  const clientId = params.get("client_id") ?? "";
  return {
    clientId,
    clientDomain: hostOf(clientId, "https:"),
    redirectHost: hostOf(params.get("redirect_uri")),
    scopes: (params.get("scope") ?? "").split(" ").filter(Boolean),
  };
}

/** The modes the client asked for enough scopes to be granted. */
export function availableModes(scopes: readonly string[]): McpMode[] {
  if (!scopes.includes(mcpScopes.read)) return [];
  return scopes.includes(mcpScopes.manage) ? ["read_only", "manage"] : ["read_only"];
}

/** The client's public name (Better Auth's public client endpoint), if it has one. */
export async function clientName(
  clientId: string,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  const response = await fetcher(
    `${apiUrl}/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    { credentials: "include" },
  ).catch(() => undefined);
  if (!response?.ok) return undefined;
  const body: unknown = await response.json().catch(() => undefined);
  if (typeof body !== "object" || body === null || !("client_name" in body)) return undefined;
  return typeof body.client_name === "string" && body.client_name ? body.client_name : undefined;
}

/**
 * Sends the person's decision to the authorization server and returns where the browser goes next: back to
 * the client, with a code or with `access_denied`. `search` is the consent page's signed query.
 */
export async function decide(
  { search, scopes, mode }: { search: string; scopes: readonly string[]; mode: McpMode | "cancel" },
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; url: string } | { ok: false }> {
  const response = await fetcher(`${apiUrl}/auth/oauth2/consent`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accept: mode !== "cancel",
      ...(mode === "cancel" ? {} : { scope: mcpScopesFor(mode, scopes).join(" ") }),
      oauth_query: search.replace(/^\?/, ""),
    }),
  }).catch(() => undefined);
  if (!response?.ok) return { ok: false };
  const body: unknown = await response.json().catch(() => undefined);
  if (typeof body !== "object" || body === null || !("url" in body)) return { ok: false };
  return typeof body.url === "string" ? { ok: true, url: body.url } : { ok: false };
}
