// MCP over OAuth 2.1 against the real app and a fresh test schema (TS-60–TS-62, TS-121): discovery, client
// registration by DCR and CIMD, sign-in and consent in each mode, tokens bound to /mcp, both protocol eras,
// the first tools, and revocation. Clients are driven as MCP clients would drive them, minus the browser.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { z } from "zod";

import { albums, oauthClients } from "@tonaris/db";
import { mcpScopes, searchKey, type McpMode } from "@tonaris/domain";

import { createTestApp } from "../testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

/** Client metadata documents the stubbed CIMD transport serves, by URL. */
const documents = new Map<string, unknown>();
const fetched: string[] = [];

beforeEach(async () => {
  documents.clear();
  fetched.length = 0;
  t = await createTestApp({
    fetchClientMetadata: async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      fetched.push(url);
      const document = documents.get(url);
      return document
        ? Response.json(document, { headers: { "cache-control": "max-age=300" } })
        : new Response("Not found", { status: 404 });
    },
  });
});

afterEach(async () => {
  await t.drop();
});

const redirectUri = "https://client.example/callback";
const allScopes = `${mcpScopes.read} ${mcpScopes.manage} offline_access`;

function mcpUrl(): string {
  return `${t.config.apiOrigin}/mcp`;
}

/** A request from an MCP client: from its own servers, so no Origin and no cookie. */
function clientCall(path: string, init: RequestInit = {}) {
  return t.app.handle(new Request(`${t.config.apiOrigin}${path}`, init));
}

async function pkce() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

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
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("client_id" in body)) throw new Error("No ID");
  return String(body.client_id);
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
  const response = await t.call(authorizeUrl(clientId, challenge, scope), {
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
  const response = await t.call("/auth/oauth2/consent", {
    headers: { cookie },
    json: { accept: mode !== "deny", scope, oauth_query: page.search.slice(1) },
  });
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("url" in body)) throw new Error("No URL");
  return new URL(String(body.url));
}

const tokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  scope: z.string(),
});
type Tokens = z.infer<typeof tokensSchema>;

const connectionsSchema = z.array(z.object({ id: z.string() }));

async function tokenRequest(form: Record<string, string>) {
  return clientCall("/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
}

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
  return tokensSchema.parse(await response.json());
}

/** Signs `email` in, connects `clientId` in `mode`, and returns the tokens. */
async function connect(email: string, clientId: string, mode: McpMode) {
  const { id, cookie } = await t.signIn(email);
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
      fetch: (url, init) => t.app.handle(new Request(String(url), init)),
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

function mcpPost(token: string | undefined, body: unknown) {
  return clientCall("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list" };

async function insertAlbum(ownerId: string, title: string, artistCredit: string, year: number) {
  await t.db.insert(albums).values({
    id: Bun.randomUUIDv7(),
    ownerId,
    title,
    artistCredit,
    originalYear: year,
    searchTitleKey: searchKey(title),
    searchArtistKey: searchKey(artistCredit),
  });
}

describe("discovery (TS-61)", () => {
  test("the protected resource names /mcp, its authorization server and the mode scopes", async () => {
    const responses = await Promise.all(
      ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"].map(
        (path) => clientCall(path),
      ),
    );
    for (const response of responses) expect(response.status).toBe(200);
    for (const metadata of await Promise.all(responses.map((response) => response.json()))) {
      expect(metadata).toMatchObject({
        resource: mcpUrl(),
        authorization_servers: [`${t.config.apiOrigin}/auth`],
        scopes_supported: [mcpScopes.read, mcpScopes.manage],
      });
    }
  });

  test("the authorization server offers CIMD, public clients, PKCE and DCR, and no client credentials", async () => {
    const responses = await Promise.all(
      [
        "/.well-known/oauth-authorization-server/auth",
        "/.well-known/oauth-authorization-server",
      ].map((path) => clientCall(path)),
    );
    for (const response of responses) expect(response.status).toBe(200);
    for (const metadata of await Promise.all(responses.map((response) => response.json()))) {
      expect(metadata).toMatchObject({
        issuer: `${t.config.apiOrigin}/auth`,
        client_id_metadata_document_supported: true,
        code_challenge_methods_supported: ["S256"],
        registration_endpoint: `${t.config.apiOrigin}/auth/oauth2/register`,
        grant_types_supported: ["authorization_code", "refresh_token"],
      });
      expect(metadata).toHaveProperty(
        "token_endpoint_auth_methods_supported",
        expect.arrayContaining(["none", "private_key_jwt"]),
      );
    }
  });

  test("other discovery paths and the JWT plugin's session token endpoint are not served", async () => {
    expect((await clientCall("/.well-known/openid-configuration")).status).toBe(404);
    expect((await clientCall("/.well-known/oauth-protected-resource/v1")).status).toBe(404);
    const { cookie } = await t.signIn("anna@example.com");
    expect((await t.call("/auth/token", { headers: { cookie } })).status).toBe(404);
  });
});

describe("unauthenticated MCP requests (TS-61)", () => {
  test("get a 401 pointing to the resource metadata and naming the scopes to ask for", async () => {
    const response = await mcpPost(undefined, listTools);
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    expect(challenge).toStartWith("Bearer ");
    expect(challenge).toContain(
      `resource_metadata="${t.config.apiOrigin}/.well-known/oauth-protected-resource/mcp"`,
    );
    expect(challenge).toContain(`scope="${mcpScopes.read} ${mcpScopes.manage} offline_access"`);
  });

  test("a forged token gets the same 401", async () => {
    const response = await mcpPost("not-a-token", listTools);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});

describe("connecting a client (FR-10.3, TS-61)", () => {
  test("the authorization request sends a signed-out person to sign-in on the web app", async () => {
    const clientId = await registerClient();
    const { challenge } = await pkce();
    const response = await t.call(authorizeUrl(clientId, challenge), {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(`${t.config.webOrigin}/sign-in`);
    expect(location.searchParams.get("client_id")).toBe(clientId);
    expect(location.searchParams.get("sig")).toBeTruthy();
  });

  test("a signed-in person reaches the consent page, which can read the client's name", async () => {
    const clientId = await registerClient("Claude-ish");
    const { cookie } = await t.signIn("anna@example.com");
    const { challenge } = await pkce();
    const page = await authorize(cookie, clientId, challenge);
    expect(page.origin + page.pathname).toBe(`${t.config.webOrigin}/oauth/consent`);
    expect(page.searchParams.get("scope")).toBe(allScopes);

    const client = await t.call(`/auth/oauth2/public-client?client_id=${clientId}`, {
      headers: { cookie },
    });
    expect(client.status).toBe(200);
    expect(await client.json()).toMatchObject({ client_id: clientId, client_name: "Claude-ish" });
  });

  test("cancelling consent returns access_denied to the client and connects nothing", async () => {
    const clientId = await registerClient();
    const { cookie } = await t.signIn("anna@example.com");
    const { challenge } = await pkce();
    const redirect = await consent(cookie, await authorize(cookie, clientId, challenge), "deny");
    expect(redirect.origin + redirect.pathname).toBe(redirectUri);
    expect(redirect.searchParams.get("error")).toBe("access_denied");
    const list = await t.call("/v1/connections", { headers: { cookie } });
    expect(await list.json()).toEqual([]);
  });

  test("Read-only grants the read scope alone; the token is a JWT bound to /mcp", async () => {
    const clientId = await registerClient();
    const { userId, tokens } = await connect("anna@example.com", clientId, "read_only");
    expect(tokens.scope.split(" ").toSorted()).toEqual(["collection:read", "offline_access"]);
    expect(tokens.refresh_token).toBeTruthy();
    const [, payload] = tokens.access_token.split(".");
    expect(JSON.parse(Buffer.from(payload ?? "", "base64url").toString())).toMatchObject({
      aud: mcpUrl(),
      azp: clientId,
      sub: userId,
      iss: `${t.config.apiOrigin}/auth`,
    });
  });

  test("a client registered by its metadata document (CIMD) connects without registering", async () => {
    const clientId = "https://client.example/oauth/client.json";
    documents.set(clientId, {
      client_id: clientId,
      client_name: "Metadata Client",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    const { tokens } = await connect("anna@example.com", clientId, "manage");
    expect(fetched).toContain(clientId);
    const [client] = await t.db.select().from(oauthClients);
    expect(client).toMatchObject({ clientId, name: "Metadata Client" });

    const mcp = await mcpClient(tokens.access_token);
    const overview = await mcp.callTool({ name: "get_overview", arguments: {} });
    expect(overview.structuredContent).toMatchObject({ connection: { mode: "manage" } });
  });
});

describe("the MCP server (TS-60, TS-63)", () => {
  test("a Read-only connection lists the tools and reads its own collection", async () => {
    const clientId = await registerClient();
    const { userId, tokens } = await connect("anna@example.com", clientId, "read_only");
    await insertAlbum(userId, "Homogenic", "Björk", 1997);
    await insertAlbum(userId, "Vespertine", "Björk", 2001);
    const other = await t.signIn("ben@example.com");
    await insertAlbum(other.id, "Debut", "Björk", 1993);

    const mcp = await mcpClient(tokens.access_token);
    const { tools } = await mcp.listTools();
    expect(tools.map((tool) => tool.name).toSorted()).toEqual(["get_overview", "search"]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

    const overview = await mcp.callTool({ name: "get_overview", arguments: {} });
    expect(overview.structuredContent).toEqual({
      albums: 2,
      unsorted: 2,
      lists: 0,
      folders: 0,
      trashUnits: 0,
      connection: { mode: "read_only" },
    });

    const found = await mcp.callTool({ name: "search", arguments: { query: "bjork" } });
    expect(found.structuredContent).toEqual({
      albums: [
        expect.objectContaining({ title: "Homogenic", artist: "Björk", year: 1997 }),
        expect.objectContaining({ title: "Vespertine", artist: "Björk", year: 2001 }),
      ],
    });
    await mcp.close();
  });

  test("a 2025-era client is served by the stateless fallback", async () => {
    const clientId = await registerClient();
    const { tokens } = await connect("anna@example.com", clientId, "read_only");
    const mcp = await mcpClient(tokens.access_token, "legacy");
    const { tools } = await mcp.listTools();
    expect(tools.map((tool) => tool.name)).toContain("get_overview");
    const overview = await mcp.callTool({ name: "get_overview", arguments: {} });
    expect(overview.structuredContent).toMatchObject({ connection: { mode: "read_only" } });
  });

  test("search treats % and _ as text", async () => {
    const clientId = await registerClient();
    const { userId, tokens } = await connect("anna@example.com", clientId, "read_only");
    await insertAlbum(userId, "100% Pure", "Someone", 2000);
    await insertAlbum(userId, "Plain", "Other", 2001);
    const mcp = await mcpClient(tokens.access_token);
    const found = await mcp.callTool({ name: "search", arguments: { query: "%" } });
    expect(found.structuredContent).toEqual({
      albums: [expect.objectContaining({ title: "100% Pure" })],
    });
  });
});

describe("tokens (TS-61, TS-62)", () => {
  test("a refresh token gets a new access token for the same connection", async () => {
    const clientId = await registerClient();
    const { tokens } = await connect("anna@example.com", clientId, "read_only");
    const response = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token ?? "",
      client_id: clientId,
      resource: mcpUrl(),
    });
    expect(response.status).toBe(200);
    const refreshed = tokensSchema.parse(await response.json());
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    expect((await mcpPost(refreshed.access_token, listTools)).status).toBe(200);
  });

  test("an MCP token is refused on /v1", async () => {
    const clientId = await registerClient();
    const { tokens } = await connect("anna@example.com", clientId, "manage");
    const response = await clientCall("/v1/me", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(response.status).toBe(401);
  });

  test("a token issued without the /mcp resource is refused on /mcp", async () => {
    const clientId = await registerClient();
    const { cookie } = await t.signIn("anna@example.com");
    const { verifier, challenge } = await pkce();
    const url = authorizeUrl(clientId, challenge).replace(/&resource=[^&]*/, "");
    const page = await t.call(url, {
      headers: { cookie, accept: "text/html" },
      redirect: "manual",
    });
    const redirect = await consent(cookie, new URL(page.headers.get("location") ?? ""), "manage");
    const response = await tokenRequest({
      grant_type: "authorization_code",
      code: redirect.searchParams.get("code") ?? "",
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: redirectUri,
    });
    const tokens = tokensSchema.parse(await response.json());
    expect((await mcpPost(tokens.access_token, listTools)).status).toBe(401);
  });
});

describe("connections in Settings (FR-10.3, DS-86)", () => {
  test("list each connected client with its mode", async () => {
    const reader = await registerClient("Reader");
    const manager = await registerClient("Manager");
    const { cookie } = await connect("anna@example.com", reader, "read_only");
    await connect("anna@example.com", manager, "manage");

    const response = await t.call("/v1/connections", { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ clientId: manager, clientName: "Manager", mode: "manage" }),
      expect.objectContaining({ clientId: reader, clientName: "Reader", mode: "read_only" }),
    ]);
  });

  test("revoking stops its access token at once, and its refresh token", async () => {
    const clientId = await registerClient();
    const { cookie, tokens } = await connect("anna@example.com", clientId, "manage");
    expect((await mcpPost(tokens.access_token, listTools)).status).toBe(200);

    const [connection] = connectionsSchema.parse(
      await (await t.call("/v1/connections", { headers: { cookie } })).json(),
    );
    const revoked = await t.call(`/v1/connections/${connection?.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(revoked.status).toBe(204);

    const refused = await mcpPost(tokens.access_token, listTools);
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toContain("resource_metadata=");
    const refresh = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token ?? "",
      client_id: clientId,
      resource: mcpUrl(),
    });
    expect(refresh.status).toBe(400);
  });

  test("one person can't see or revoke another's connection", async () => {
    const clientId = await registerClient();
    const anna = await connect("anna@example.com", clientId, "manage");
    const ben = await t.signIn("ben@example.com");
    expect(
      await (await t.call("/v1/connections", { headers: { cookie: ben.cookie } })).json(),
    ).toEqual([]);
    const [connection] = connectionsSchema.parse(
      await (await t.call("/v1/connections", { headers: { cookie: anna.cookie } })).json(),
    );
    const response = await t.call(`/v1/connections/${connection?.id}`, {
      method: "DELETE",
      headers: { cookie: ben.cookie },
    });
    expect(response.status).toBe(404);
    expect((await mcpPost(anna.tokens.access_token, listTools)).status).toBe(200);
  });

  test("a client authorizing again within its connection skips the consent page", async () => {
    const clientId = await registerClient();
    const { cookie } = await connect("anna@example.com", clientId, "manage");
    const { challenge } = await pkce();
    const response = await t.call(authorizeUrl(clientId, challenge), {
      headers: { cookie, accept: "text/html" },
      redirect: "manual",
    });
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(redirectUri);
    expect(location.searchParams.get("code")).toBeTruthy();
  });

  test("consenting again as Read-only narrows the tokens issued under Manage", async () => {
    const clientId = await registerClient();
    const { cookie, tokens } = await connect("anna@example.com", clientId, "manage");
    const { challenge } = await pkce();
    // `prompt=consent` asks again although a consent exists; the person picks Read-only this time.
    const again = await t.call(`${authorizeUrl(clientId, challenge)}&prompt=consent`, {
      headers: { cookie, accept: "text/html" },
      redirect: "manual",
    });
    await consent(cookie, new URL(again.headers.get("location") ?? ""), "read_only");

    const mcp = await mcpClient(tokens.access_token);
    const overview = await mcp.callTool({ name: "get_overview", arguments: {} });
    expect(overview.structuredContent).toMatchObject({ connection: { mode: "read_only" } });
  });
});

describe("client registration limits (TS-61)", () => {
  test("an address may register 10 clients an hour", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => registerClient(`c${i}`, "198.51.100.4")),
    );
    const response = await clientCall("/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.4" },
      body: JSON.stringify({ client_name: "one more", redirect_uris: [redirectUri] }),
    });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "rate_limited" });
    await registerClient("elsewhere", "198.51.100.5");
  });
});
