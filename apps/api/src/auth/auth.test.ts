// Sign-in against the real app and a fresh test schema (TS-121): the accounts and admission specs' API
// scenarios. Email is captured in memory; each test signs in as its own account.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { sessions, users, verifications } from "@tonaris/db";

import { createTestApp, inSequence, insertUser, type SentEmail } from "../testing";
import { createSignInLimiter } from "./sign-in-limits";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

const requestCodePath = "/auth/email-otp/send-verification-otp";
const signInPath = "/auth/sign-in/email-otp";

function requestCode(email: string, headers: Record<string, string> = {}) {
  return t.call(requestCodePath, { json: { email, type: "sign-in" }, headers });
}

function submitCode(email: string, otp: string, headers: Record<string, string> = {}) {
  return t.call(signInPath, { json: { email, otp }, headers });
}

function codeOf(email: SentEmail): string {
  if (!("code" in email.data)) throw new Error(`Expected a code, got ${email.template}`);
  return email.data.code;
}

/** Requests a code for `email` and returns it from the email that arrives. */
async function emailedCode(email: string): Promise<string> {
  const arrived = t.email.next(email);
  expect((await requestCode(email)).status).toBe(200);
  return codeOf(await arrived);
}

/** The `name=value` pairs of a response's cookies, as a browser would send them back. */
function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function signIn(email: string): Promise<string> {
  const response = await submitCode(email, await emailedCode(email));
  expect(response.status).toBe(200);
  return cookieHeader(response);
}

/** Raw SQL on the test schema, for moving stored times. */
const sql = (strings: TemplateStringsArray, ...values: never[]) => t.db.$client(strings, ...values);

function me(cookie?: string) {
  return t.call("/v1/me", cookie ? { headers: { cookie } } : {});
}

describe("signing in with an emailed code (FR-11.1)", () => {
  test("the creator signs in with a code and the API knows them", async () => {
    const id = await insertUser(t.db, "creator@example.com", { role: "creator" });
    const cookie = await signIn("creator@example.com");

    const response = await me(cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id,
      email: "creator@example.com",
      displayName: null,
      role: "creator",
      termsAgreed: false,
    });
  });

  test("the code email carries a link to the verify page that submits the same code", async () => {
    await insertUser(t.db, "anna@example.com");
    const arrived = t.email.next("anna@example.com");
    await requestCode("anna@example.com");
    const email = await arrived;

    const code = codeOf(email);
    const link = `http://localhost:3000/sign-in/verify?email=anna%40example.com#code=${code}`;
    expect(email.data).toEqual({ code, link });
    expect(code).toMatch(/^\d{6}$/);
    expect(email.text).toContain(link);
  });

  test("email case and surrounding spaces don't matter", async () => {
    const id = await insertUser(t.db, "creator@example.com");
    const arrived = t.email.next("creator@example.com");
    expect((await requestCode("  Creator@Example.COM ")).status).toBe(200);
    const code = codeOf(await arrived);

    const response = await submitCode("CREATOR@example.com", code);
    expect(response.status).toBe(200);
    expect(await (await me(cookieHeader(response))).json()).toMatchObject({ id });
  });

  test("a wrong code is rejected", async () => {
    await insertUser(t.db, "anna@example.com");
    const code = await emailedCode("anna@example.com");
    const wrong = code === "000000" ? "111111" : "000000";

    const response = await submitCode("anna@example.com", wrong);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_OTP" });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("a code works once", async () => {
    await insertUser(t.db, "anna@example.com");
    const code = await emailedCode("anna@example.com");
    expect((await submitCode("anna@example.com", code)).status).toBe(200);
    expect((await submitCode("anna@example.com", code)).status).toBe(400);
  });

  test("a code expires after 10 minutes", async () => {
    await insertUser(t.db, "anna@example.com");
    const code = await emailedCode("anna@example.com");
    const [pending] = await t.db.select().from(verifications);
    // Stored hashed, never as the code itself (TS-70); valid for 10 minutes.
    expect(pending?.value).not.toContain(code);
    expect((pending?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(9.9 * 60_000);
    expect((pending?.expiresAt.getTime() ?? 0) - Date.now()).toBeLessThanOrEqual(10 * 60_000);

    await sql`update verification set expires_at = now() - interval '1 second'`;
    const response = await submitCode("anna@example.com", code);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "OTP_EXPIRED" });
  });

  test("5 wrong attempts void the code", async () => {
    await insertUser(t.db, "anna@example.com");
    const code = await emailedCode("anna@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    const attempts = await inSequence(5, () => submitCode("anna@example.com", wrong));
    expect(attempts.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
    expect((await submitCode("anna@example.com", code)).status).toBe(403);
  });

  test("requesting a new code replaces the old one", async () => {
    await insertUser(t.db, "anna@example.com");
    const first = await emailedCode("anna@example.com");
    const second = await emailedCode("anna@example.com");
    if (first !== second) expect((await submitCode("anna@example.com", first)).status).toBe(400);
    expect((await submitCode("anna@example.com", second)).status).toBe(200);
  });

  test("an address that isn't an email is refused and gets nothing", async () => {
    const response = await requestCode("not-an-email");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_EMAIL" });
    await Bun.sleep(50);
    expect(t.email.sent).toEqual([]);
  });

  test("only sign-in codes can be requested", async () => {
    await insertUser(t.db, "anna@example.com");
    const response = await t.call(requestCodePath, {
      json: { email: "anna@example.com", type: "forget-password" },
    });
    expect(response.status).toBe(400);
    expect(t.email.sent).toEqual([]);
  });
});

describe("sign-in never creates an account (FR-11.2)", () => {
  test("an unknown address gets the same response and a no-account email", async () => {
    await insertUser(t.db, "anna@example.com");
    const known = await requestCode("anna@example.com");
    const arrived = t.email.next("nobody@example.com");
    const unknown = await requestCode("nobody@example.com");

    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    const email = await arrived;
    expect(email.template).toBe("sign-in-no-account");
    expect(email.text).not.toMatch(/\d{6}/);
  });

  test("no code signs up an unknown address", async () => {
    await requestCode("nobody@example.com");
    const responses = await inSequence(2, (i) =>
      submitCode("nobody@example.com", ["000000", "123456"][i] ?? ""),
    );
    for (const response of responses) expect(response.status).toBe(400);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies).toEqual([
      { message: "Invalid OTP", code: "INVALID_OTP" },
      { message: "Invalid OTP", code: "INVALID_OTP" },
    ]);
    expect(await t.db.select().from(users)).toEqual([]);
  });
});

describe("sign-in limits (TS-104)", () => {
  test("a sixth code request for one email within 15 minutes is refused", async () => {
    await insertUser(t.db, "anna@example.com");
    const accepted = await inSequence(5, () => requestCode("anna@example.com"));
    expect(accepted.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    await t.email.next("anna@example.com", 4);

    const refused = await requestCode("Anna@example.com");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("content-type")).toBe("application/problem+json");
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await refused.json()).toMatchObject({ status: 429, code: "rate_limited" });
    // Give a stray send the chance to show up: there is none.
    await Bun.sleep(50);
    expect(t.email.sent.filter((email) => email.to === "anna@example.com")).toHaveLength(5);
  });

  test("one address can't flood sign-in", async () => {
    await t.drop();
    const now = { value: Date.now() };
    t = await createTestApp({ limiter: createSignInLimiter(undefined, () => now.value) });
    const from = { "x-forwarded-for": "198.51.100.1, 203.0.113.7" };
    const statuses = await inSequence(10, async (i) => [
      (await requestCode(`p${i}@example.com`, from)).status,
      (await submitCode(`p${i}@example.com`, "000000", from)).status,
    ]);
    expect(statuses).toEqual(Array.from({ length: 10 }, () => [200, 400]));
    expect((await submitCode("p0@example.com", "000000", from)).status).toBe(429);
    expect((await requestCode("other@example.com", from)).status).toBe(429);
    // The proxy's last entry is the client; other clients are unaffected.
    expect(
      (await requestCode("other@example.com", { "x-forwarded-for": "203.0.113.8" })).status,
    ).toBe(200);

    now.value += 15 * 60_000;
    expect((await requestCode("other@example.com", from)).status).toBe(200);
  });
});

describe("the session (TS-08, TS-70)", () => {
  test("the cookie is __Secure-, HttpOnly, Lax and lasts 30 days, host-only locally", async () => {
    await insertUser(t.db, "anna@example.com");
    const response = await submitCode("anna@example.com", await emailedCode("anna@example.com"));
    const [cookie, ...others] = response.headers.getSetCookie();
    expect(others).toEqual([]);
    expect(cookie).toStartWith("__Secure-tonaris.session_token=");
    const attributes = cookie?.split("; ").slice(1);
    expect(attributes).toEqual(["Max-Age=2592000", "Path=/", "HttpOnly", "Secure", "SameSite=Lax"]);
  });

  test("in production the cookie is scoped to the parent domain of both hosts", async () => {
    await t.drop();
    t = await createTestApp({
      env: { WEB_ORIGIN: "https://tonaris.example", API_ORIGIN: "https://api.tonaris.example" },
    });
    await insertUser(t.db, "anna@example.com");
    const response = await submitCode("anna@example.com", await emailedCode("anna@example.com"));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toContain("; Domain=tonaris.example;");
  });

  test("the web origin gets credentialed CORS; other origins get none", async () => {
    await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");

    const fromWeb = await me(cookie);
    expect(fromWeb.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(fromWeb.headers.get("access-control-allow-credentials")).toBe("true");

    const preflight = await t.call(requestCodePath, {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(preflight.headers.get("access-control-max-age")).toBe("600");

    const fromElsewhere = await t.call("/v1/me", {
      headers: { cookie, origin: "https://evil.example" },
    });
    expect(fromElsewhere.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("a session in use for over a day rolls over to 30 days from now", async () => {
    await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");
    await sql`update session set expires_at = now() + interval '28 days', updated_at = now() - interval '2 days'`;

    const response = await me(cookie);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toContain("Max-Age=2592000");
    const [session] = await t.db.select().from(sessions);
    expect((session?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(29.9 * 86_400_000);
  });

  test("a recent session is not renewed on every request", async () => {
    await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");
    expect((await me(cookie)).headers.getSetCookie()).toEqual([]);
  });
});

describe("GET /v1/me", () => {
  test("answers unauthenticated without a session", async () => {
    const response = await me();
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      code: "unauthenticated",
      instance: "/v1/me",
      detail: "Sign in to continue.",
    });
  });

  test("answers unauthenticated for an expired session or a forged cookie", async () => {
    await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");
    expect((await me("__Secure-tonaris.session_token=forged.value")).status).toBe(401);
    await sql`update session set expires_at = now() - interval '1 second'`;
    expect((await me(cookie)).status).toBe(401);
  });

  test("shows the display name once there is one", async () => {
    await insertUser(t.db, "anna@example.com", { displayName: "Anna" });
    const cookie = await signIn("anna@example.com");
    expect(await (await me(cookie)).json()).toMatchObject({ displayName: "Anna", role: "user" });
  });
});

describe("signing out (FR-11.1)", () => {
  test("ends the session on the server and clears the cookie", async () => {
    await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");

    const response = await t.call("/auth/sign-out", { json: {}, headers: { cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toContain(
      "__Secure-tonaris.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    expect(await t.db.select().from(sessions)).toEqual([]);
    expect((await me(cookie)).status).toBe(401);
  });

  test("is refused from another origin, so a foreign page can't sign people out", async () => {
    await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");
    const response = await t.call("/auth/sign-out", {
      json: {},
      headers: { cookie, origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    expect((await me(cookie)).status).toBe(200);
  });
});

describe("only the sign-in endpoints are exposed", () => {
  test("other auth endpoints are not found and change nothing", async () => {
    const id = await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");
    const attempts = [
      t.call("/auth/sign-up/email", {
        json: { email: "new@example.com", password: "long enough password", name: "New" },
      }),
      t.call("/auth/update-user", { json: { name: "Renamed" }, headers: { cookie } }),
      t.call("/auth/list-sessions", { headers: { cookie } }),
      t.call("/auth/email-otp/check-verification-otp", {
        json: { email: "anna@example.com", type: "sign-in", otp: "000000" },
      }),
      t.call("/auth/sign-in/email-otp", { headers: { cookie } }),
    ];
    const responses = await Promise.all(attempts);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    for (const body of bodies) expect(body).toMatchObject({ code: "not_found" });
    expect(await t.db.select({ id: users.id, displayName: users.displayName }).from(users)).toEqual(
      [{ id, displayName: null }],
    );
  });

  test("the session can be read where Better Auth serves it", async () => {
    await insertUser(t.db, "anna@example.com");
    const cookie = await signIn("anna@example.com");
    const response = await t.call("/auth/get-session", { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { email: "anna@example.com" } });
  });
});
