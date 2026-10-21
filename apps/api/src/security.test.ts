// The API's security baseline (TS-101, TS-102) against the real app and a fresh test schema.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createTestApp, insertUser } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

/** Signs `email` in and returns the cookie header a browser would send back. */
async function signedIn(email: string): Promise<string> {
  await insertUser(t.db, email);
  const arrived = t.email.next(email);
  await t.call("/auth/email-otp/send-verification-otp", { json: { email, type: "sign-in" } });
  const sent = await arrived;
  if (!("code" in sent.data)) throw new Error("no code");
  const response = await t.call("/auth/sign-in/email-otp", {
    json: { email, otp: sent.data.code },
  });
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

describe("response headers (TS-101)", () => {
  test("every kind of response carries them", async () => {
    const responses = await Promise.all([
      t.call("/v1/health"),
      t.call("/v1/me"),
      t.call("/v1/nothing-here"),
      t.call("/auth/get-session"),
      t.call("/healthz"),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 401, 404, 200, 200]);
    for (const response of responses) {
      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("strict-transport-security")).toBe(
        "max-age=31536000; includeSubDomains",
      );
    }
  });
});

describe("CSRF (TS-102)", () => {
  test("a cookie-carrying write from another origin is refused before anything runs", async () => {
    const cookie = await signedIn("anna@example.com");
    const response = await t.call("/auth/sign-out", {
      json: {},
      headers: { cookie, origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toMatchObject({ code: "permission_denied" });
    expect((await t.call("/v1/me", { headers: { cookie } })).status).toBe(200);
  });

  test("a cookie-carrying write without an origin is refused", async () => {
    const cookie = await signedIn("anna@example.com");
    const response = await t.app.handle(
      new Request(`${t.config.apiOrigin}/auth/sign-out`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
  });

  test("a write that isn't JSON is refused, so HTML forms can't post", async () => {
    const cookie = await signedIn("anna@example.com");
    const responses = await Promise.all(
      ["text/plain", "application/x-www-form-urlencoded"].map((contentType) =>
        t.app.handle(
          new Request(`${t.config.apiOrigin}/auth/sign-out`, {
            method: "POST",
            headers: { cookie, origin: t.config.webOrigin, "content-type": contentType },
            body: "{}",
          }),
        ),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([415, 415]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    for (const body of bodies) expect(body).toMatchObject({ code: "validation_failed" });
    expect((await t.call("/v1/me", { headers: { cookie } })).status).toBe(200);
  });

  test("a DELETE needs no body, since browsers preflight it anyway, but cookies still need the web origin", async () => {
    const cookie = await signedIn("anna@example.com");
    const revoke = (origin: string) =>
      t.app.handle(
        new Request(`${t.config.apiOrigin}/v1/connections/${Bun.randomUUIDv7()}`, {
          method: "DELETE",
          headers: { cookie, origin },
        }),
      );
    expect((await revoke(t.config.webOrigin)).status).toBe(404);
    expect((await revoke("https://evil.example")).status).toBe(403);
  });

  test("MCP clients post forms to the OAuth token endpoint", async () => {
    const response = await t.app.handle(
      new Request(`${t.config.apiOrigin}/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code: "nope" }),
      }),
    );
    // Better Auth's OAuth error, not the CSRF rule's 415.
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });

  test("JSON writes from the web origin go through", async () => {
    const cookie = await signedIn("anna@example.com");
    const response = await t.call("/auth/sign-out", {
      json: {},
      headers: { cookie, "content-type": "application/json; charset=utf-8" },
    });
    expect(response.status).toBe(200);
  });

  test("a write without cookies needs no origin, as native apps send none", async () => {
    await insertUser(t.db, "anna@example.com");
    const response = await t.app.handle(
      new Request(`${t.config.apiOrigin}/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "anna@example.com", type: "sign-in" }),
      }),
    );
    expect(response.status).toBe(200);
  });

  test("/v1 writes follow the same rule", async () => {
    const cookie = await signedIn("anna@example.com");
    const write = (headers: Record<string, string>) =>
      t.call("/v1/anything", { method: "PATCH", json: {}, headers: { cookie, ...headers } });
    expect((await write({ origin: "https://evil.example" })).status).toBe(403);
    // A bearer request ignores its cookies, so the origin doesn't matter; the route doesn't exist.
    expect(
      (await write({ origin: "https://evil.example", authorization: "Bearer token" })).status,
    ).toBe(404);
  });

  test("reads pass from any origin, but only the web origin may read the answer", async () => {
    const cookie = await signedIn("anna@example.com");
    const response = await t.call("/v1/me", {
      headers: { cookie, origin: "https://evil.example" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("bearer principals ignore cookies (TS-102)", () => {
  test("a bearer request isn't signed in by the cookie it also carries", async () => {
    const cookie = await signedIn("anna@example.com");
    const response = await t.call("/v1/me", {
      headers: { cookie, authorization: "Bearer not-a-token" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
  });
});
