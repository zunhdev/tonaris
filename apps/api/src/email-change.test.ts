// Changing the sign-in email (FR-11.4, TS-73, AC-39's self-service part) against the real app and a fresh test
// schema: both addresses are verified, in order; refusals and code rules; cancelling; and after the swap, the same
// account behind the new address only, with its other sessions ended.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { auditLog, emailChanges, users } from "@tonaris/db";
import {
  accountSchema,
  emailChangeRefusalDetails as refusals,
  emailChangeSchema,
  emailChangeStepSchema,
} from "@tonaris/domain";

import { createTestApp, insertUser, type SentEmail } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let anna: { id: string; cookie: string };

const current = "anna@example.com";
const next = "anna@new.example";

beforeEach(async () => {
  t = await createTestApp();
  anna = await t.signIn(current);
});

afterEach(async () => {
  await t.drop();
});

function change(path: string, init: { method?: string; json?: unknown; cookie?: string } = {}) {
  const { cookie = anna.cookie, ...rest } = init;
  return t.call(`/v1/account/email-change${path}`, { ...rest, headers: { cookie } });
}

const problem = async (response: Response) =>
  z.object({ code: z.string(), detail: z.string() }).parse(await response.json());

function codeOf(email: SentEmail): string {
  if (!("code" in email.data)) throw new Error(`Expected a code, got ${email.template}`);
  return email.data.code;
}

/** Starts the change to `to` and returns the code emailed to the current address. */
async function start(to = next): Promise<string> {
  const arrived = t.email.next(current);
  const response = await change("", { json: { newEmail: to } });
  expect(response.status).toBe(200);
  expect(emailChangeSchema.parse(await response.json())).toEqual({
    newEmail: to,
    stage: "current",
  });
  return codeOf(await arrived);
}

const verify = (code: string, cookie = anna.cookie) =>
  change("/verify", { json: { code }, cookie });

/** Through both steps: answers the response to the new address's code. */
async function changeTo(to = next): Promise<Response> {
  const currentCode = await start(to);
  const arrived = t.email.next(to);
  const step = await verify(currentCode);
  expect(emailChangeStepSchema.parse(await step.json())).toEqual({ stage: "new", newEmail: to });
  return verify(codeOf(await arrived));
}

async function me(cookie: string) {
  return t.call("/v1/me", { headers: { cookie } });
}

describe("both addresses, in order (FR-11.4)", () => {
  test("the current address gets the first code, naming the new one; the new address gets the second", async () => {
    const firstArrival = t.email.next(current);
    await change("", { json: { newEmail: " Anna@New.Example " } });
    const first = await firstArrival;
    expect(first).toMatchObject({
      template: "email-change-current",
      data: { newEmail: next },
      subject: "Your code to change your Tonaris sign-in email",
    });
    expect(t.email.sent.filter((email) => email.to === next)).toEqual([]);

    const secondArrival = t.email.next(next);
    await verify(codeOf(first));
    expect((await secondArrival).template).toBe("email-change-new");
    const progress = await change("");
    expect(await progress.json()).toEqual({ change: { newEmail: next, stage: "new" } });
  });

  test("the swap keeps the account, ends its other sessions, and records it", async () => {
    const elsewhere = await t.signIn(current);
    const [hereStream, elsewhereStream] = await Promise.all([
      t.openStream(anna.cookie),
      t.openStream(elsewhere.cookie),
    ]);
    const done = await changeTo();
    expect(emailChangeStepSchema.parse(await done.json())).toEqual({ stage: "done", email: next });
    // The other session's stream ends at once, not at the next session check (TS-23); this one's stays.
    expect(await elsewhereStream.endsWithin(1_000)).toBe(true);
    expect(await hereStream.endsWithin(50)).toBe(false);
    await hereStream.close();

    // This browser stays signed in, as the same account at the new address; the other session is gone.
    const here = accountSchema.parse(await (await me(anna.cookie)).json());
    expect(here).toMatchObject({ id: anna.id, email: next });
    expect((await me(elsewhere.cookie)).status).toBe(401);
    expect(await t.db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        actor: anna.id,
        subject: anna.id,
        action: "email.change",
        details: { from: current, to: next },
      }),
    ]);
    expect(await (await change("")).json()).toEqual({ change: null });
  });

  test("afterwards the old address reaches no account, and the new one the same account", async () => {
    await changeTo();
    const noAccount = t.email.next(current);
    await t.call("/auth/email-otp/send-verification-otp", {
      json: { email: current, type: "sign-in" },
    });
    expect((await noAccount).template).toBe("sign-in-no-account");

    const again = await t.signIn(next);
    expect(again.id).toBe(anna.id);
    expect((await t.db.select().from(users)).filter((user) => user.id === anna.id)).toHaveLength(1);
  });
});

describe("refusals and codes", () => {
  test("a non-address, the current address and another account's address are refused, sending nothing", async () => {
    await insertUser(t.db, "ben@example.com");
    const sent = t.email.sent.length;
    for (const [newEmail, detail] of [
      ["not an address", refusals.notEmail],
      ["ANNA@example.com", refusals.same],
      ["Ben@Example.com", refusals.taken],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await change("", { json: { newEmail } });
      expect(response.status).toBe(422);
      // oxlint-disable-next-line no-await-in-loop
      expect((await problem(response)).detail).toBe(detail);
    }
    await Bun.sleep(50);
    expect(t.email.sent.length).toBe(sent);
  });

  test("a wrong code is refused, five lock it, and a resent code works", async () => {
    const code = await start();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await verify(wrong);
      // oxlint-disable-next-line no-await-in-loop
      expect((await problem(response)).detail).toBe(refusals.wrongCode);
    }
    expect((await problem(await verify(code))).detail).toBe(refusals.tooManyAttempts);

    const resent = t.email.next(current);
    const response = await change("/resend", { json: {} });
    expect(await response.json()).toEqual({ newEmail: next, stage: "current" });
    const step = await verify(codeOf(await resent));
    expect(step.status).toBe(200);
  });

  test("an expired code is refused, and so is a code with no change in progress", async () => {
    const code = await start();
    await t.db.update(emailChanges).set({ expiresAt: new Date(Date.now() - 1) });
    const expired = await verify(code);
    expect(expired.status).toBe(410);
    expect((await problem(expired)).detail).toBe(refusals.expired);

    await change("", { method: "DELETE" });
    const none = await verify(code);
    expect(none.status).toBe(404);
    expect((await problem(none)).detail).toBe(refusals.none);
  });

  test("cancelling at the new address's step changes nothing", async () => {
    const code = await start();
    const arrived = t.email.next(next);
    await verify(code);
    const newCode = codeOf(await arrived);
    expect((await change("", { method: "DELETE" })).status).toBe(204);
    expect((await verify(newCode)).status).toBe(404);
    const here = accountSchema.parse(await (await me(anna.cookie)).json());
    expect(here.email).toBe(current);
    expect(await t.db.select().from(auditLog)).toEqual([]);
  });

  test("an address taken before the last code refuses the swap, and neither account changes", async () => {
    const code = await start();
    const arrived = t.email.next(next);
    await verify(code);
    const ben = await insertUser(t.db, next);
    const refused = await verify(codeOf(await arrived));
    expect(refused.status).toBe(422);
    expect((await problem(refused)).detail).toBe(refusals.taken);
    const accounts = Object.fromEntries(
      (await t.db.select().from(users)).map((user) => [user.id, user.email]),
    );
    expect(accounts).toMatchObject({ [anna.id]: current, [ben]: next });
  });

  test("a bearer token never reaches the routes", async () => {
    const response = await t.call("/v1/account/email-change", {
      headers: { authorization: "Bearer mcp-token" },
    });
    expect(response.status).toBe(401);
  });
});
