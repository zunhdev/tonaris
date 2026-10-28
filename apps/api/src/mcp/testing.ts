// Test helpers for MCP over OAuth (TS-121): a client registered by DCR, the person's sign-in and consent as the
// web app makes them, the token exchange, and an MCP client on the token, all against the test app. Import from
// tests only.

import { expect } from "bun:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { z } from "zod";

import { albums, containers, memberships } from "@tonaris/db";
import { mcpScopes, nameKey, searchKey, type McpMode } from "@tonaris/domain";

import type { createTestApp } from "../testing";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export const redirectUri = "https://client.example/callback";
export const allScopes = `${mcpScopes.read} ${mcpScopes.manage} offline_access`;

const tokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string(),
});
export type Tokens = z.infer<typeof tokensSchema>;
export const parseTokens = (body: unknown): Tokens => tokensSchema.parse(body);

/** A PKCE verifier and its S256 challenge (RFC 7636). */
export async function pkce() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

/** The helpers, on whichever test app `current` returns: each test makes a fresh one. */
export function mcpHarness(current: () => TestApp) {
  const mcpUrl = () => `${current().config.apiOrigin}/mcp`;

  /** A request from an MCP client: from its own servers, so no Origin and no cookie. */
  const clientCall = (path: string, init: RequestInit = {}) =>
    current().app.handle(new Request(`${current().config.apiOrigin}${path}`, init));

  /** Registers a public client by DCR (RFC 7591), as the fallback to CIMD. Returns its client ID. */
  async function registerClient(name = "Test client", ip = "203.0.113.9"): Promise<string> {
    const response = await clientCall("/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({
        client_name: name,
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    expect(response.status).toBe(201);
    return z.object({ client_id: z.string() }).parse(await response.json()).client_id;
  }

  function authorizeUrl(clientId: string, challenge: string, scope = allScopes): string {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state: "state-1",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: mcpUrl(),
    });
    return `/auth/oauth2/authorize?${query.toString()}`;
  }

  /** The authorization request in the person's browser: signed in, it lands on the consent page. */
  async function authorize(cookie: string, clientId: string, challenge: string, scope?: string) {
    const response = await current().call(authorizeUrl(clientId, challenge, scope), {
      headers: { cookie, accept: "text/html" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    return new URL(response.headers.get("location") ?? "");
  }

  /** The consent page's decision, as the web app posts it (DS-85). Returns the client's redirect. */
  async function consent(cookie: string, page: URL, mode: McpMode | "deny") {
    const requested = page.searchParams.get("scope")?.split(" ") ?? [];
    const scope = requested.filter((s) => mode === "manage" || s !== mcpScopes.manage).join(" ");
    const response = await current().call("/auth/oauth2/consent", {
      headers: { cookie },
      json: { accept: mode !== "deny", scope, oauth_query: page.search.slice(1) },
    });
    expect(response.status).toBe(200);
    return new URL(z.object({ url: z.string() }).parse(await response.json()).url);
  }

  const tokenRequest = (form: Record<string, string>) =>
    clientCall("/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    });

  async function exchange(clientId: string, code: string, verifier: string): Promise<Tokens> {
    const response = await tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: redirectUri,
      resource: mcpUrl(),
    });
    expect(response.status).toBe(200);
    return parseTokens(await response.json());
  }

  /** Signs `email` in, connects `clientId` in `mode`, and returns the account, its cookie and the tokens. */
  async function connect(email: string, clientId: string, mode: McpMode) {
    const { id, cookie } = await current().signIn(email);
    const { verifier, challenge } = await pkce();
    const page = await authorize(cookie, clientId, challenge);
    const redirect = await consent(cookie, page, mode);
    const code = redirect.searchParams.get("code") ?? "";
    return { userId: id, cookie, tokens: await exchange(clientId, code, verifier) };
  }

  /** An MCP client on `token`, speaking the 2026-07-28 protocol, or the 2025 one through the fallback. */
  async function mcpClient(token: string, era: "modern" | "legacy" = "modern") {
    const client = new Client(
      { name: "test", version: "1.0.0" },
      era === "modern" ? { versionNegotiation: { mode: { pin: "2026-07-28" } } } : {},
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(mcpUrl()), {
        fetch: (url, init) => current().app.handle(new Request(String(url), init)),
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  }

  const mcpPost = (token: string | undefined, body: unknown) =>
    clientCall("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });

  /** Inserts an active album straight into the collection. Returns its ID. */
  async function insertAlbum(ownerId: string, title: string, artistCredit: string, year: number) {
    const id = Bun.randomUUIDv7();
    await current()
      .db.insert(albums)
      .values({
        id,
        ownerId,
        title,
        artistCredit,
        originalYear: year,
        searchTitleKey: searchKey(title),
        searchArtistKey: searchKey(artistCredit),
      });
    return id;
  }

  /** Inserts a list at the root holding `albumIds`. Returns its ID. */
  async function insertList(ownerId: string, name: string, albumIds: string[] = []) {
    const id = Bun.randomUUIDv7();
    await current()
      .db.insert(containers)
      .values({
        id,
        ownerId,
        kind: "list",
        parentId: null,
        name,
        nameKey: nameKey(name),
        searchNameKey: searchKey(name),
      });
    if (albumIds.length > 0) {
      await current()
        .db.insert(memberships)
        .values(albumIds.map((albumId) => ({ listId: id, albumId, ownerId })));
    }
    return id;
  }

  return {
    mcpUrl,
    clientCall,
    registerClient,
    authorizeUrl,
    authorize,
    consent,
    tokenRequest,
    exchange,
    connect,
    mcpClient,
    mcpPost,
    insertAlbum,
    insertList,
  };
}
