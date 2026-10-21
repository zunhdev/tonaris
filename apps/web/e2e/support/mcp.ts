// An MCP client for the browser tests (TS-61): registered by DCR, its HTTP calls made from its "servers"
// (a request context without the browser's cookies), and its callback caught in the browser.

import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { z } from "zod";

import { apiUrl } from "./accounts";

export const callback = "http://127.0.0.1:3199/callback";

export async function pkce() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

/** Registers a client by DCR, as an MCP client without a metadata document would. */
export async function registerClient(client: APIRequestContext): Promise<string> {
  const response = await client.post(`${apiUrl}/auth/oauth2/register`, {
    data: {
      client_name: "E2E Client",
      redirect_uris: [callback],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(response.status()).toBe(201);
  return z.object({ client_id: z.string() }).parse(await response.json()).client_id;
}

/** The client's authorization request for `challenge`, as the browser opens it. */
export function authorizeUrl(clientId: string, challenge: string, scope: string): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope,
    state: "e2e",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${apiUrl}/mcp`,
  });
  return `${apiUrl}/auth/oauth2/authorize?${query.toString()}`;
}

/** Catches the client's callback in `page` and returns a getter for the query it received. */
export async function catchCallback(page: Page, body = "Connected") {
  let received: URLSearchParams | undefined;
  await page.route(`${callback}**`, async (route) => {
    received = new URL(route.request().url()).searchParams;
    await route.fulfill({ body });
  });
  return () => received;
}

/** Exchanges the code for an access token bound to /mcp. */
export async function exchange(
  client: APIRequestContext,
  { clientId, code, verifier }: { clientId: string; code: string; verifier: string },
): Promise<{ token: string; scope: string }> {
  const response = await client.post(`${apiUrl}/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: callback,
      resource: `${apiUrl}/mcp`,
    },
  });
  expect(response.status()).toBe(200);
  const tokens = z
    .object({ access_token: z.string(), scope: z.string() })
    .parse(await response.json());
  return { token: tokens.access_token, scope: tokens.scope };
}

/** One JSON-RPC call to /mcp, through the stateless fallback for 2025-era clients (TS-60). */
export function mcpRequest(client: APIRequestContext, token: string, body: unknown) {
  return client.post(`${apiUrl}/mcp`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    data: body,
  });
}

/** Calls a tool and returns its structured result. */
export async function callTool(
  client: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await mcpRequest(client, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name, arguments: args },
  });
  expect(response.status()).toBe(200);
  // The 2025 fallback answers a request as a one-event stream: the JSON-RPC response is its `data:` line.
  const text = await response.text();
  const json = response.headers()["content-type"]?.startsWith("text/event-stream")
    ? (text
        .split("\n")
        .findLast((line) => line.startsWith("data:"))
        ?.slice(5) ?? "")
    : text;
  return z
    .object({ result: z.object({ structuredContent: z.record(z.string(), z.unknown()) }) })
    .parse(JSON.parse(json)).result.structuredContent;
}
