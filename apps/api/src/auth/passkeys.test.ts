// Passkeys (FR-11.1, DS-93, TON-143) against the real app, its passkey plugin and a fresh test schema, with a
// software authenticator in the browser's place: adding one needs a fresh session and a verified person and sends a
// notice; signing in with one needs no email; the limits count it; the plugin's own management stays unserved;
// `/v1/account/passkeys` lists, renames and removes; and recovery and deletion remove passkeys.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { passkeys } from "@tonaris/db";
import { passkeyRefusalDetails, passkeySchema } from "@tonaris/domain";

import { createTestApp, insertUser, type SentEmail } from "../testing";
import {
  anonymousAaguid,
  flags,
  softAuthenticator,
  type SoftAuthenticator,
} from "./passkey-testing";
import { createSignInLimiter, signInLimits } from "./sign-in-limits";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.drop();
});

/** The `name=value` pairs of a response's cookies, as a browser sends them back. */
const cookiesOf = (response: Response) =>
  response.headers.getSetCookie().map((cookie) => cookie.split(";")[0] ?? "");

const join = (...cookies: (string | string[] | undefined)[]) =>
  cookies.flat().filter(Boolean).join("; ");

const sessionCookieOf = (response: Response) =>
  cookiesOf(response).find((cookie) => cookie.includes("session_token="));

const codeOf = async (response: Response) =>
  z.object({ code: z.string() }).parse(await response.json()).code;

const registrationOptions = z.object({
  challenge: z.string(),
  rp: z.object({ id: z.string(), name: z.string() }),
  user: z.object({ id: z.string(), name: z.string() }),
  authenticatorSelection: z.object({ residentKey: z.string(), userVerification: z.string() }),
  excludeCredentials: z.array(z.object({ id: z.string() })),
});

const authenticationOptions = z.object({ challenge: z.string(), rpId: z.string() });

const authenticator = (aaguid?: string) =>
  softAuthenticator({ origin: t.config.webOrigin, ...(aaguid ? { aaguid } : {}) });

/** Asks for registration options with `cookie`; answers them with the challenge's cookie, or the refusal. */
async function registrationStart(cookie: string) {
  const response = await t.call("/auth/passkey/generate-register-options", { headers: { cookie } });
  if (response.status !== 200) return { response } as const;
  return {
    response,
    options: registrationOptions.parse(await response.json()),
    challenge: cookiesOf(response),
  } as const;
}

/** Adds `device`'s passkey to the account signed in with `cookie`, answering the registration's response. */
async function addPasskey(
  cookie: string,
  device: SoftAuthenticator,
  { flagBits, body = {} }: { flagBits?: number; body?: Record<string, unknown> } = {},
) {
  const start = await registrationStart(cookie);
  if (!start.options) throw new Error(`Registration options: HTTP ${start.response.status}`);
  return t.call("/auth/passkey/verify-registration", {
    json: { response: device.register(start.options, flagBits), ...body },
    headers: { cookie: join(cookie, start.challenge) },
  });
}

/** Signs in with `device`'s passkey, from no session, as the sign-in page does. */
async function passkeySignIn(
  device: SoftAuthenticator,
  { flagBits, headers = {} }: { flagBits?: number; headers?: Record<string, string> } = {},
) {
  const start = await t.call("/auth/passkey/generate-authenticate-options", { headers });
  expect(start.status).toBe(200);
  const options = authenticationOptions.parse(await start.json());
  return t.call("/auth/passkey/verify-authentication", {
    json: { response: await device.authenticate(options, flagBits) },
    headers: { ...headers, cookie: join(cookiesOf(start)) },
  });
}

const listed = async (cookie: string) => {
  const response = await t.call("/v1/account/passkeys", { headers: { cookie } });
  expect(response.status).toBe(200);
  return z.array(passkeySchema).parse(await response.json());
};

const me = (cookie: string | undefined) => t.call("/v1/me", { headers: cookie ? { cookie } : {} });

/** Raw SQL on the test schema, for moving stored times. */
const sql = (strings: TemplateStringsArray, ...values: string[]) =>
  t.db.$client(strings, ...values);

describe("adding a passkey (DS-93)", () => {
  test("a fresh session adds a discoverable, verified passkey named after its password manager, with a notice", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const start = await registrationStart(cookie);
    expect(start.options).toMatchObject({
      // The web host, where browsers create passkeys, not the API's (TON-143).
      rp: { id: "localhost", name: "Tonaris" },
      user: { name: "anna@example.com" },
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });

    const notice = t.email.next("anna@example.com");
    const device = await authenticator();
    const added = await addPasskey(cookie, device);
    expect(added.status).toBe(200);

    expect(await listed(cookie)).toEqual([
      { id: expect.any(String), name: "Google Password Manager", createdAt: expect.any(String) },
    ]);
    const email: SentEmail = await notice;
    expect(email).toMatchObject({
      template: "passkey-added",
      data: {
        name: "Google Password Manager",
        link: "http://localhost:3000/settings/account",
      },
    });
    expect(email.text).toContain('A passkey named "Google Password Manager"');
  });

  test("an unknown model is named Passkey, and a name or a session asked for in the body is ignored", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const added = await addPasskey(cookie, await authenticator(anonymousAaguid), {
      body: { name: "Chosen by the client", createSession: true },
    });
    expect(added.status).toBe(200);
    expect(sessionCookieOf(added)).toBeUndefined();
    expect((await listed(cookie)).map((passkey) => passkey.name)).toEqual(["Passkey"]);
  });

  test("an authenticator that doesn't verify the person is refused", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const added = await addPasskey(cookie, await authenticator(), {
      flagBits: flags.userPresent,
    });
    expect(added.status).toBe(400);
    expect(await codeOf(added)).toBe("USER_VERIFICATION_REQUIRED");
    expect(await listed(cookie)).toEqual([]);
    expect(t.email.sent.map((email) => email.template)).not.toContain("passkey-added");
  });

  test("a session older than a day signs in again first", async () => {
    const { id, cookie } = await t.signIn("anna@example.com");
    await sql`update session set created_at = now() - interval '2 days' where user_id = ${id}`;

    const stale = await registrationStart(cookie);
    expect(stale.response.status).toBe(403);
    expect(await codeOf(stale.response)).toBe("SESSION_NOT_FRESH");

    const { cookie: fresh } = await t.signIn("anna@example.com");
    expect((await addPasskey(fresh, await authenticator())).status).toBe(200);
  });

  test("the options exclude the account's passkeys, so a device that has one isn't asked again", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const device = await authenticator();
    await addPasskey(cookie, device);
    const again = await registrationStart(cookie);
    expect(again.options?.excludeCredentials.map((credential) => credential.id)).toEqual([
      device.id,
    ]);
  });

  test("needs a session", async () => {
    const start = await t.call("/auth/passkey/generate-register-options");
    expect(start.status).toBe(401);
  });
});

describe("signing in with a passkey (FR-11.1)", () => {
  test("starts the account's session with no email", async () => {
    const { id, cookie } = await t.signIn("anna@example.com");
    const device = await authenticator();
    await addPasskey(cookie, device);
    // The code that signed in, then the notice.
    await t.email.next("anna@example.com", 1);
    const before = t.email.sent.length;

    const signedIn = await passkeySignIn(device);
    expect(signedIn.status).toBe(200);
    const session = sessionCookieOf(signedIn);
    expect(await (await me(session)).json()).toMatchObject({ id, email: "anna@example.com" });
    expect(t.email.sent).toHaveLength(before);
  });

  test("the options name the web host and no account, so the page needs no email first", async () => {
    const start = await t.call("/auth/passkey/generate-authenticate-options");
    const options: unknown = await start.json();
    expect(options).toMatchObject({ rpId: "localhost" });
    expect(options).not.toHaveProperty("allowCredentials");
  });

  test("an answer that doesn't verify the person starts no session", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const device = await authenticator();
    await addPasskey(cookie, device);

    const signedIn = await passkeySignIn(device, { flagBits: flags.userPresent });
    expect(signedIn.status).toBe(400);
    expect(await codeOf(signedIn)).toBe("USER_VERIFICATION_REQUIRED");
    expect(sessionCookieOf(signedIn)).toBeUndefined();
  });

  test("a passkey the account doesn't have signs in to nothing", async () => {
    const signedIn = await passkeySignIn(await authenticator());
    expect(signedIn.status).toBe(401);
    expect(await codeOf(signedIn)).toBe("PASSKEY_NOT_FOUND");
  });

  test("a challenge works once", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const device = await authenticator();
    await addPasskey(cookie, device);
    const start = await t.call("/auth/passkey/generate-authenticate-options");
    const options = authenticationOptions.parse(await start.json());
    const answer = { response: await device.authenticate(options) };
    const challenge = { cookie: join(cookiesOf(start)) };

    const first = await t.call("/auth/passkey/verify-authentication", {
      json: answer,
      headers: challenge,
    });
    expect(first.status).toBe(200);
    const replayed = await t.call("/auth/passkey/verify-authentication", {
      json: answer,
      headers: challenge,
    });
    expect(replayed.status).toBe(400);
    expect(await codeOf(replayed)).toBe("CHALLENGE_NOT_FOUND");
  });

  test("an answer from another origin is refused", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    await addPasskey(cookie, await authenticator());
    const elsewhere = await softAuthenticator({ origin: "https://evil.example" });
    const start = await t.call("/auth/passkey/generate-authenticate-options");
    const options = authenticationOptions.parse(await start.json());
    const signedIn = await t.call("/auth/passkey/verify-authentication", {
      json: { response: await elsewhere.authenticate({ ...options, rpId: "localhost" }) },
      headers: { cookie: join(cookiesOf(start)) },
    });
    expect(signedIn.status).not.toBe(200);
    expect(sessionCookieOf(signedIn)).toBeUndefined();
  });
});

describe("the sign-in limit (TS-104)", () => {
  test("passkey starts and sign-ins count toward the 20 steps per IP address", async () => {
    await t.drop();
    t = await createTestApp({
      limiter: createSignInLimiter({
        perEmail: signInLimits.perEmail,
        perIp: { ...signInLimits.perIp, max: 3 },
      }),
    });
    await insertUser(t.db, "anna@example.com");
    const ip = { "x-forwarded-for": "203.0.113.9" };
    const device = await authenticator();

    // A start and a finish are two steps; the third is a start.
    expect((await passkeySignIn(device, { headers: ip })).status).toBe(401);
    expect(
      (await t.call("/auth/passkey/generate-authenticate-options", { headers: ip })).status,
    ).toBe(200);

    const refused = await t.call("/auth/passkey/generate-authenticate-options", { headers: ip });
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await codeOf(refused)).toBe("rate_limited");
    // Codes share the budget.
    const code = await t.call("/auth/sign-in/email-otp", {
      json: { email: "anna@example.com", otp: "123456" },
      headers: ip,
    });
    expect(code.status).toBe(429);
    // Another address isn't affected.
    const other = { "x-forwarded-for": "203.0.113.10" };
    expect(
      (await t.call("/auth/passkey/generate-authenticate-options", { headers: other })).status,
    ).toBe(200);
  });
});

describe("the plugin's own management isn't served (TS-70)", () => {
  test("its list, update and delete endpoints are not found", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    const device = await authenticator();
    await addPasskey(cookie, device);
    const before = await listed(cookie);
    const [passkey] = before;

    for (const [path, init] of [
      ["/auth/passkey/list-user-passkeys", {}],
      ["/auth/passkey/update-passkey", { json: { id: passkey?.id, name: "Mine" } }],
      ["/auth/passkey/delete-passkey", { json: { id: passkey?.id } }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one after another
      const response = await t.call(path, { ...init, headers: { cookie } });
      expect(response.status).toBe(404);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      expect(await codeOf(response)).toBe("not_found");
    }
    expect(await listed(cookie)).toEqual(before);
  });
});

describe("/v1/account/passkeys (DS-93)", () => {
  test("lists newest first, renames with the name trimmed, and refuses blank and long names", async () => {
    const { cookie } = await t.signIn("anna@example.com");
    await addPasskey(cookie, await authenticator());
    await sql`update passkey set created_at = now() - interval '1 hour'`;
    await addPasskey(cookie, await authenticator(anonymousAaguid));
    const [newest, oldest] = await listed(cookie);
    expect([newest?.name, oldest?.name]).toEqual(["Passkey", "Google Password Manager"]);

    const rename = (name: string) =>
      t.call(`/v1/account/passkeys/${newest?.id}`, {
        method: "PATCH",
        json: { name },
        headers: { cookie },
      });
    const renamed = await rename("  Work laptop ");
    expect(renamed.status).toBe(200);
    expect(await renamed.json()).toMatchObject({ id: newest?.id, name: "Work laptop" });

    for (const [name, detail] of [
      ["   ", passkeyRefusalDetails.blank],
      ["x".repeat(201), passkeyRefusalDetails.tooLong],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one after another
      const refused = await rename(name);
      expect(refused.status).toBe(422);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      expect(await refused.json()).toMatchObject({ code: "validation_failed", detail });
    }
    expect((await listed(cookie)).map((passkey) => passkey.name)).toEqual([
      "Work laptop",
      "Google Password Manager",
    ]);
  });

  test("removing stops the passkey at once; email codes still work; another account's is not found", async () => {
    const anna = await t.signIn("anna@example.com");
    const ben = await t.signIn("ben@example.com");
    const device = await authenticator();
    await addPasskey(anna.cookie, device);
    const [passkey] = await listed(anna.cookie);
    const path = `/v1/account/passkeys/${passkey?.id}`;

    const bens = await t.call(path, { method: "DELETE", headers: { cookie: ben.cookie } });
    expect(bens.status).toBe(404);
    const bensRename = await t.call(path, {
      method: "PATCH",
      json: { name: "Ben's now" },
      headers: { cookie: ben.cookie },
    });
    expect(bensRename.status).toBe(404);

    const removed = await t.call(path, { method: "DELETE", headers: { cookie: anna.cookie } });
    expect(removed.status).toBe(204);
    expect(await listed(anna.cookie)).toEqual([]);
    expect((await passkeySignIn(device)).status).toBe(401);
    expect((await me(anna.cookie)).status).toBe(200);
    expect((await me((await t.signIn("anna@example.com")).cookie)).status).toBe(200);
  });

  test("need a session", async () => {
    expect((await t.call("/v1/account/passkeys")).status).toBe(401);
  });
});

describe("recovery and deletion remove passkeys (FR-11.5, FR-11.11)", () => {
  test("a confirmed recovery removes the account's passkeys", async () => {
    await insertUser(t.db, "creator@example.com", { role: "creator" });
    const creator = await t.signIn("creator@example.com");
    const anna = await t.signIn("anna@old.example");
    const device = await authenticator();
    await addPasskey(anna.cookie, device);

    const arrived = t.email.next("anna@new.example");
    const started = await t.call(`/v1/admin/members/${anna.id}/recovery`, {
      json: {
        newEmail: "anna@new.example",
        reason: "Lost her mailbox",
        disconnectConnections: false,
      },
      headers: { cookie: creator.cookie },
    });
    expect(started.status).toBe(200);
    const email = await arrived;
    if (!("link" in email.data) || !("code" in email.data)) throw new Error("No recovery link");
    const token = decodeURIComponent(new URL(email.data.link).pathname.replace("/recover/", ""));
    const confirmed = await t.call("/auth/recovery/confirm", {
      json: { token, code: email.data.code },
    });
    expect(confirmed.status).toBe(200);

    expect(await t.db.select().from(passkeys)).toEqual([]);
    expect((await passkeySignIn(device)).status).toBe(401);
  });

  test("a deletion's start stops its passkeys", async () => {
    const anna = await t.signIn("anna@example.com");
    const device = await authenticator();
    await addPasskey(anna.cookie, device);

    const deleting = await t.call("/v1/account/deletion", {
      json: { email: "anna@example.com" },
      headers: { cookie: anna.cookie },
    });
    expect(deleting.status).toBe(200);
    const signedIn = await passkeySignIn(device);
    expect(signedIn.status).toBe(401);
    expect(sessionCookieOf(signedIn)).toBeUndefined();
  });
});
