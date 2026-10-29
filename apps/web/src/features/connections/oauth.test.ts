import { describe, expect, test } from "bun:test";

import { apiUrl } from "@/config";

import { mcpScopes } from "@tonaris/domain";

import { authorizeContinuation, availableModes, consentRequest, decide } from "./oauth";

const signed =
  "response_type=code&client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback" +
  "&scope=collection%3Aread+collection%3Amanage&state=s1&code_challenge=c1&code_challenge_method=S256" +
  "&exp=1&ba_iat=2&ba_param=client_id&ba_param=scope&sig=xyz";

describe("authorizeContinuation (TS-61)", () => {
  test("turns the authorization server's sign-in request into the client's request", () => {
    const continuation = authorizeContinuation(`?${signed}`) ?? "";
    expect(continuation).toStartWith("/oauth/authorize?");
    const params = new URLSearchParams(continuation.split("?")[1]);
    expect(params.get("client_id")).toBe("abc");
    expect(params.get("scope")).toBe("collection:read collection:manage");
    for (const name of ["sig", "exp", "ba_iat", "ba_param"]) expect(params.has(name)).toBe(false);
  });

  test("drops the login prompt sign-in just satisfied, and keeps the others", () => {
    const login = new URLSearchParams(
      authorizeContinuation(`${signed}&prompt=login`)?.split("?")[1],
    );
    expect(login.has("prompt")).toBe(false);
    const both = authorizeContinuation(`${signed}&prompt=login+consent`)?.split("?")[1];
    expect(new URLSearchParams(both).get("prompt")).toBe("consent");
  });

  test("leaves an ordinary sign-in alone", () => {
    expect(authorizeContinuation("?redirect=%2Fc")).toBeUndefined();
    expect(authorizeContinuation("?client_id=abc")).toBeUndefined();
  });
});

describe("the consent request (DS-85)", () => {
  test("names the client, its redirect host and the scopes it asked for", () => {
    expect(consentRequest(`?${signed}`)).toEqual({
      clientId: "abc",
      clientDomain: undefined,
      redirectHost: "claude.ai",
      scopes: [mcpScopes.read, mcpScopes.manage],
    });
  });

  test("a client registered by its metadata document is from that document's domain (DS-85)", () => {
    const codex = new URLSearchParams({
      client_id: "https://chatgpt.com/oauth/codex/client.json",
      redirect_uri: "http://127.0.0.1:52713/callback",
      scope: mcpScopes.read,
    });
    expect(consentRequest(`?${codex}`)).toMatchObject({
      clientDomain: "chatgpt.com",
      redirectHost: "127.0.0.1:52713",
    });
  });

  test("offers the modes the client asked enough for", () => {
    expect(availableModes([mcpScopes.read, mcpScopes.manage])).toEqual(["read_only", "manage"]);
    expect(availableModes([mcpScopes.read])).toEqual(["read_only"]);
    expect(availableModes(["offline_access"])).toEqual([]);
  });

  test("Read-only accepts the read scope alone; cancelling accepts nothing", async () => {
    const sent: unknown[] = [];
    const fetcher: typeof fetch = Object.assign(
      (input: string | URL | Request, init?: RequestInit) => {
        expect(input instanceof Request ? input.url : input.toString()).toBe(
          `${apiUrl}/auth/oauth2/consent`,
        );
        sent.push(JSON.parse(typeof init?.body === "string" ? init.body : ""));
        return Promise.resolve(
          Response.json({ redirect: true, url: "https://claude.ai/api/mcp/auth_callback?code=1" }),
        );
      },
      { preconnect: fetch.preconnect },
    );
    const scopes = [mcpScopes.read, mcpScopes.manage, "offline_access"];

    const result = await decide({ search: `?${signed}`, scopes, mode: "read_only" }, fetcher);
    expect(result).toEqual({ ok: true, url: "https://claude.ai/api/mcp/auth_callback?code=1" });
    await decide({ search: `?${signed}`, scopes, mode: "cancel" }, fetcher);
    expect(sent).toEqual([
      { accept: true, scope: "collection:read offline_access", oauth_query: signed },
      { accept: false, oauth_query: signed },
    ]);
  });
});
