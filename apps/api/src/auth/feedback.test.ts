// Sign in with Tonaris on the feedback board (FR-11.15, TON-144), as Fider drives it: the person's browser at the
// authorization endpoint, then Fider's server exchanging the code with its secret and reading userinfo. The board
// gets the person's ID, name and email and nothing more; AI clients can't read the profile.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { oauthClients } from "@tonaris/db";
import { mcpScopes } from "@tonaris/domain";

import { mcpHarness, pkce } from "../mcp/testing";
import { createTestApp } from "../testing";
import { mcpRequestedScopes } from "./auth";
import { feedbackClientId, feedbackFallbackName, syncFeedbackClient } from "./feedback";

const callbackUrl = "https://login.fider.example/oauth/_k3j9x0q2ab/callback";
const clientSecret = "feedback-board-secret-0123456789abcdef";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp({
    env: { FEEDBACK_CALLBACK_URL: callbackUrl, FEEDBACK_CLIENT_SECRET: clientSecret },
  });
});

afterEach(async () => {
  await t.drop();
});

const { clientCall, registerClient, connect, mcpPost } = mcpHarness(() => t);

/** The request Fider's sign-in route sends the person to: no PKCE, no resource. */
function boardAuthorizeUrl(scope = "openid email", redirectUri = callbackUrl): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: feedbackClientId,
    redirect_uri: redirectUri,
    scope,
    state: "fider-state",
  });
  return `/auth/oauth2/authorize?${query.toString()}`;
}

/** The person's browser at the authorization endpoint, signed in to Tonaris. Returns where it is sent. */
async function authorizeBoard(cookie: string, scope?: string): Promise<URL> {
  const response = await t.call(boardAuthorizeUrl(scope), {
    headers: { cookie, accept: "text/html" },
    redirect: "manual",
  });
  expect(response.status).toBe(302);
  return new URL(response.headers.get("location") ?? "");
}

/** Fider's server exchanging the code, with its secret in Basic authentication. */
const exchangeCode = (code: string, secret = clientSecret) =>
  clientCall("/auth/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${feedbackClientId}:${secret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
    }),
  });

const userInfo = (token: string) =>
  clientCall("/auth/oauth2/userinfo", { headers: { authorization: `Bearer ${token}` } });

/** Signs `email` in to Tonaris, then to the board. Returns the account's ID and the board's access token. */
async function signInToBoard(email: string): Promise<{ id: string; token: string }> {
  const { id, cookie } = await t.signIn(email);
  const redirect = await authorizeBoard(cookie);
  expect(`${redirect.origin}${redirect.pathname}`).toBe(callbackUrl);
  expect(redirect.searchParams.get("state")).toBe("fider-state");
  const response = await exchangeCode(redirect.searchParams.get("code") ?? "");
  expect(response.status).toBe(200);
  const { access_token } = z.object({ access_token: z.string() }).parse(await response.json());
  return { id, token: access_token };
}

describe("signing in to the feedback board", () => {
  test("goes straight back to the board, without consent or PKCE, and tells it the ID, name and email", async () => {
    const { id, token } = await signInToBoard("anna@example.com");
    await t.db.$client`update "user" set display_name = 'Anna' where id = ${id}`;

    const response = await userInfo(token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      sub: id,
      name: "Anna",
      email: "anna@example.com",
    });
  });

  test("names someone without a display name neutrally, never by their email", async () => {
    const { token } = await signInToBoard("ben.smith@example.com");
    const profile = z.object({ name: z.string() }).parse(await (await userInfo(token)).json());
    expect(profile.name).toBe(feedbackFallbackName);
  });

  test("sends someone signed out to Tonaris's sign-in first", async () => {
    const response = await t.call(boardAuthorizeUrl(), {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toStartWith(`${t.config.webOrigin}/sign-in`);
  });

  test("the board's token opens neither MCP nor the app's API", async () => {
    const { token } = await signInToBoard("anna@example.com");
    const mcp = await mcpPost(token, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(mcp.status).toBe(401);
    const me = await clientCall("/v1/me", { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(401);
  });

  test("isn't an AI connection in Settings", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    await authorizeBoard(cookie);
    const connections = await t.call("/v1/connections", { headers: { cookie } });
    expect(await connections.json()).toEqual([]);
  });

  test("a wrong secret gets no token", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const redirect = await authorizeBoard(cookie);
    const response = await exchangeCode(redirect.searchParams.get("code") ?? "", "x".repeat(40));
    expect(response.status).toBe(401);
  });

  test("the board can ask for nothing beyond the person's ID, name and email", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const redirect = await authorizeBoard(cookie, `openid email ${mcpScopes.read}`);
    expect(redirect.searchParams.get("error")).toBe("invalid_scope");
    expect(redirect.searchParams.get("code")).toBeNull();
  });

  test("an unregistered redirect gets no code", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const response = await t.call(
      boardAuthorizeUrl(undefined, "https://elsewhere.example/oauth/_k3j9x0q2ab/callback"),
      { headers: { cookie, accept: "text/html" }, redirect: "manual" },
    );
    expect(response.headers.get("location") ?? "").not.toContain("elsewhere.example");
  });

  test("stops working once the configuration is removed", async () => {
    await syncFeedbackClient(t.db, undefined);
    // The test app's only client.
    const [client] = await t.db.select().from(oauthClients);
    expect(client).toMatchObject({ clientId: feedbackClientId, disabled: true });
    const { cookie } = await t.signIn("anna@example.com");
    const response = await t.call(boardAuthorizeUrl(), {
      headers: { cookie, accept: "text/html" },
      redirect: "manual",
    });
    expect(response.headers.get("location") ?? "").not.toContain("code=");
  });
});

describe("AI clients", () => {
  test("can't ask for the person's profile", async () => {
    const clientId = await registerClient();
    const { cookie } = await t.signIn("anna@example.com");
    const { challenge } = await pkce();
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: "https://client.example/callback",
      scope: "openid email",
      state: "state-1",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const response = await t.call(`/auth/oauth2/authorize?${query.toString()}`, {
      headers: { cookie, accept: "text/html" },
      redirect: "manual",
    });
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("invalid_scope");
  });

  test("an MCP token can't read userinfo", async () => {
    const clientId = await registerClient();
    const { tokens } = await connect("anna@example.com", clientId, "read_only");
    const response = await userInfo(tokens.access_token);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await response.json())).not.toContain("anna@example.com");
  });

  test("discovery still offers only MCP's scopes", async () => {
    const response = await clientCall("/.well-known/oauth-authorization-server/auth");
    const metadata = z
      .object({ scopes_supported: z.array(z.string()) })
      .parse(await response.json());
    expect(metadata.scopes_supported).toEqual([...mcpRequestedScopes]);
  });
});
