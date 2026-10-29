// Invite-only account creation (TS-71 spike) against the real app and a fresh test schema. The proof: joining is
// one transaction with Better Auth's code and session, so concurrent or repeated registrations never use an
// invitation without creating its account, and never create two accounts (FR-11.6, FR-13.5).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import {
  admissionInvitations,
  type Database,
  revokeAdmissionInvitation,
  sessions,
  setAdmissionsPaused,
  serviceState,
  users,
  verifications,
} from "@tonaris/db";
import { accountSchema, admissionRefusalDetails } from "@tonaris/domain";

import { createTestApp, inSequence, insertUser, inviteForTest, type SentEmail } from "../testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let creatorId: string;

beforeEach(async () => {
  t = await createTestApp();
  creatorId = await insertUser(t.db, "creator@example.com", { role: "creator" });
});

afterEach(async () => {
  await t.drop();
});

function invite(email: string) {
  return inviteForTest(t.db, { email, createdBy: creatorId });
}

function requestCode(token: string) {
  return t.call("/auth/admission/code", { json: { token } });
}

function join(token: string, otp: string) {
  return t.call("/auth/admission/join", { json: { token, otp } });
}

function codeOf(email: SentEmail): string {
  if (!("code" in email.data)) throw new Error(`Expected a code, got ${email.template}`);
  return email.data.code;
}

/** Asks for a code with the invitation's token and returns it from the email to `address`. */
async function emailedCode(token: string, address: string): Promise<string> {
  const arrived = t.email.next(address);
  expect((await requestCode(token)).status).toBe(200);
  return codeOf(await arrived);
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function accountsWith(email: string) {
  return (await t.db.select().from(users)).filter((user) => user.email === email);
}

async function invitation(id: string) {
  const row = (await t.db.select().from(admissionInvitations)).find((stored) => stored.id === id);
  if (!row) throw new Error(`No invitation ${id}`);
  return row;
}

async function sessionsOf(userId: string) {
  return (await t.db.select().from(sessions)).filter((session) => session.userId === userId);
}

/** The stored sign-in codes for `email`, each `hash:attempts` (TS-70). */
async function storedCodes(email: string) {
  return (await t.db.select().from(verifications))
    .filter((code) => code.identifier === `sign-in-otp-${email}`)
    .map(({ value }) => ({ value }));
}

/** A refusal: a problem, or Better Auth's error for a code (`INVALID_OTP`). */
const refusalSchema = z.object({ code: z.string(), detail: z.string().optional() });

async function problem(response: Response) {
  return refusalSchema.parse(await response.json());
}

/** The account a session cookie signs in to. */
async function accountOf(response: Response) {
  const me = await t.call("/v1/me", { headers: { cookie: cookieHeader(response) } });
  return accountSchema.parse(await me.json());
}

/**
 * Opens a transaction that runs `work` and then stays open, holding its locks, until `commit()`; as a pause or
 * a revocation would while a join is in flight.
 */
async function holdOpen(db: Database, work: Parameters<Database["transaction"]>[0]) {
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const done = db.transaction(async (tx) => {
    await work(tx);
    ready.resolve();
    await release.promise;
  });
  await ready.promise;
  return {
    commit: async () => {
      release.resolve();
      await done;
    },
  };
}

/** Resolves once a query of this schema's admission waits on a row lock. */
async function lockWaitOn(table: string): Promise<void> {
  for (let tries = 0; tries < 500; tries += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const waiting = await t.db.$client`
      select 1 from pg_stat_activity
      where wait_event_type = 'Lock' and query like ${`%"${table}"%`}`;
    if (waiting.length > 0) return;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(10);
  }
  throw new Error(`No query waited on ${table}`);
}

describe("joining with an invitation (FR-11.2, DS-91)", () => {
  test("the code goes to the invited address; joining creates the account and signs in", async () => {
    const { id, token } = await invite("New.Member@Example.com");

    const arrived = t.email.next("new.member@example.com");
    const requested = await requestCode(token);
    expect(requested.status).toBe(200);
    expect(await requested.json()).toEqual({ email: "new.member@example.com" });
    const sent = await arrived;
    expect(sent.template).toBe("join-code");
    expect(sent.data).toEqual({
      code: codeOf(sent),
      link: `${t.config.webOrigin}/join/${token}#code=${codeOf(sent)}`,
    });

    const joined = await join(token, codeOf(sent));
    expect(joined.status).toBe(200);
    const account = await accountOf(joined);
    expect(account).toEqual({
      id: account.id,
      email: "new.member@example.com",
      displayName: null,
      role: "user",
    });

    expect(await invitation(id)).toMatchObject({
      status: "redeemed",
      redeemedBy: account.id,
      redeemedAt: expect.any(Date),
    });
    // The code worked once.
    expect(await storedCodes("new.member@example.com")).toEqual([]);
  });

  test("a forwarded link can't enroll another address: the code goes only to the invited one", async () => {
    const first = await invite("first@example.com");
    const second = await invite("second@example.com");
    const firstCode = await emailedCode(first.token, "first@example.com");

    const response = await join(second.token, firstCode);
    expect(response.status).toBe(400);
    expect((await problem(response)).code).toBe("INVALID_OTP");
    expect(await accountsWith("second@example.com")).toEqual([]);
    expect((await invitation(second.id)).status).toBe("available");
  });

  test("signing in never creates an account, even for an invited address", async () => {
    await invite("invited@example.com");
    const arrived = t.email.next("invited@example.com");
    await t.call("/auth/email-otp/send-verification-otp", {
      json: { email: "invited@example.com", type: "sign-in" },
    });
    expect((await arrived).template).toBe("sign-in-no-account");
    expect(await accountsWith("invited@example.com")).toEqual([]);
  });

  test("wrong codes count as attempts although nothing else commits, and five lock the code", async () => {
    const { id, token } = await invite("guess@example.com");
    const code = await emailedCode(token, "guess@example.com");
    const wrong = code === "000000" ? "111111" : "000000";

    const guesses = await inSequence(5, async () => (await problem(await join(token, wrong))).code);
    expect(guesses).toEqual(Array.from({ length: 5 }, () => "INVALID_OTP"));
    const locked = await join(token, code);
    expect(locked.status).toBe(403);
    expect((await problem(locked)).code).toBe("TOO_MANY_ATTEMPTS");
    expect(await accountsWith("guess@example.com")).toEqual([]);
    expect((await invitation(id)).status).toBe("available");
  });

  test("the landing's lookup answers the invited address, and sends nothing", async () => {
    const { token } = await invite("New.Member@Example.com");
    const response = await t.call("/auth/admission/invitation", { json: { token } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "new.member@example.com" });
    expect(t.email.sent.filter((email) => email.to === "new.member@example.com")).toEqual([]);
    expect(await storedCodes("new.member@example.com")).toEqual([]);
  });

  test("an unknown link, a revoked, expired or used invitation, and a pause each get their sentence", async () => {
    /** The landing's lookup and the code request both refuse `token` with `status` and `detail`. */
    async function refusedWith(token: string, status: number, detail: string) {
      for (const path of ["/auth/admission/invitation", "/auth/admission/code"]) {
        // oxlint-disable-next-line no-await-in-loop
        const response = await t.call(path, { json: { token } });
        // oxlint-disable-next-line no-await-in-loop
        const { detail: given } = await problem(response);
        expect({ path, status: response.status, detail: given }).toEqual({ path, status, detail });
      }
    }

    await refusedWith("not-a-token", 404, admissionRefusalDetails.invalid);

    const revoked = await invite("revoked@example.com");
    await revokeAdmissionInvitation(t.db, revoked.id);
    await refusedWith(revoked.token, 403, admissionRefusalDetails.revoked);

    const expired = await inviteForTest(t.db, {
      email: "late@example.com",
      createdBy: creatorId,
      now: new Date(Date.now() - 15 * 24 * 60 * 60_000),
    });
    await refusedWith(expired.token, 410, admissionRefusalDetails.expired);

    const used = await invite("used@example.com");
    await join(used.token, await emailedCode(used.token, "used@example.com"));
    await refusedWith(used.token, 403, admissionRefusalDetails.redeemed);

    const later = await invite("later@example.com");
    await setAdmissionsPaused(t.db, true);
    await refusedWith(later.token, 403, admissionRefusalDetails.paused);
  });

  test("a pause refuses joining with a code sent before it, while existing members still sign in", async () => {
    const { id, token } = await invite("paused@example.com");
    const code = await emailedCode(token, "paused@example.com");
    await setAdmissionsPaused(t.db, true);

    const refused = await join(token, code);
    expect(refused.status).toBe(403);
    expect((await problem(refused)).detail).toBe(admissionRefusalDetails.paused);
    expect(await accountsWith("paused@example.com")).toEqual([]);
    expect((await invitation(id)).status).toBe("available");
    expect((await t.signIn("creator@example.com")).cookie).toContain("session_token");

    // Pausing neither redeems nor revokes: after resuming, the same code still works.
    await setAdmissionsPaused(t.db, false);
    expect((await join(token, code)).status).toBe(200);
  });
});

describe("one transaction with Better Auth's session (TS-71)", () => {
  test("a failure while creating the session leaves no account, and the invitation and code unused", async () => {
    const { id, token } = await invite("atomic@example.com");
    const code = await emailedCode(token, "atomic@example.com");
    // Session rows can't be written: the account and the redemption, already done, must roll back.
    await t.db.$client.unsafe(`
      create function refuse_session() returns trigger language plpgsql
        as $$ begin raise exception 'no sessions today'; end $$;
      create trigger refuse_session before insert on session
        for each row execute function refuse_session();`);

    const failed = await join(token, code);
    expect(failed.status).toBe(500);
    expect(await accountsWith("atomic@example.com")).toEqual([]);
    expect(await invitation(id)).toMatchObject({ status: "available", redeemedBy: null });
    expect(await storedCodes("atomic@example.com")).toEqual([
      { value: expect.stringMatching(/:0$/) },
    ]);

    // The same code works once sessions can be written again.
    await t.db.$client.unsafe("drop trigger refuse_session on session");
    const joined = await join(token, code);
    expect(joined.status).toBe(200);
    const [account] = await accountsWith("atomic@example.com");
    expect((await invitation(id)).redeemedBy).toBe(account?.id ?? "missing");
  });
});

describe("concurrent and repeated registrations (FR-11.6, FR-13.5)", () => {
  test("simultaneous joins with the same code create one account and redeem the invitation once", async () => {
    const { id, token } = await invite("double@example.com");
    const code = await emailedCode(token, "double@example.com");

    const responses = await Promise.all(Array.from({ length: 8 }, () => join(token, code)));
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    // The others found the invitation used, or the code used, depending on when they arrived.
    expect(statuses.filter((status) => status !== 200).every((s) => s === 403 || s === 400)).toBe(
      true,
    );

    const accounts = await accountsWith("double@example.com");
    expect(accounts).toHaveLength(1);
    const accountId = accounts[0]?.id ?? "missing";
    expect((await invitation(id)).redeemedBy).toBe(accountId);
    expect(await sessionsOf(accountId)).toHaveLength(1);
  });

  test("a retry after a lost response finds the invitation used, and sign-in reaches the account", async () => {
    const { id, token } = await invite("retry@example.com");
    const code = await emailedCode(token, "retry@example.com");
    // The account is created, but the response (and its cookie) never arrives.
    expect((await join(token, code)).status).toBe(200);

    // Retrying is refused, without a second account: the code was used, and so was the invitation.
    expect((await problem(await join(token, code))).code).toBe("INVALID_OTP");
    const again = await requestCode(token);
    expect(again.status).toBe(403);
    expect((await problem(again)).detail).toBe(admissionRefusalDetails.redeemed);
    // As that sentence says, the person signs in, and reaches the account the first attempt created.
    const { id: signedInId } = await t.signIn("retry@example.com");

    const accounts = await accountsWith("retry@example.com");
    expect(accounts.map((account) => account.id)).toEqual([signedInId]);
    expect(await invitation(id)).toMatchObject({ status: "redeemed", redeemedBy: signedInId });
    expect(await sessionsOf(signedInId)).toHaveLength(2);
  });

  test("an invitation to an address that already has an account signs its owner in", async () => {
    // Issued before the address had an account, as when a member's email changes to it (TON-77): the admin
    // refuses to invite an address with an account.
    const { id, token } = await invite("member@example.com");
    const memberId = await insertUser(t.db, "member@example.com");

    const joined = await join(token, await emailedCode(token, "member@example.com"));
    expect(joined.status).toBe(200);
    expect((await accountOf(joined)).id).toBe(memberId);
    expect(await accountsWith("member@example.com")).toHaveLength(1);
    // The invitation stays as it was; revoking it is the creator's call.
    expect((await invitation(id)).status).toBe("available");
  });

  test("a pause committed while a join waits refuses the join; the code still works after resuming", async () => {
    const { id, token } = await invite("race-pause@example.com");
    const code = await emailedCode(token, "race-pause@example.com");

    const pause = await holdOpen(t.db, async (tx) => {
      await tx.update(serviceState).set({ admissionsPaused: true });
    });
    const joining = join(token, code);
    await lockWaitOn("service_state");
    await pause.commit();

    const refused = await joining;
    expect(refused.status).toBe(403);
    expect((await problem(refused)).detail).toBe(admissionRefusalDetails.paused);
    expect(await accountsWith("race-pause@example.com")).toEqual([]);
    expect((await invitation(id)).status).toBe("available");

    await setAdmissionsPaused(t.db, false);
    expect((await join(token, code)).status).toBe(200);
  });

  test("a revocation committed while a join waits refuses the join", async () => {
    const { id, token } = await invite("race-revoke@example.com");
    const code = await emailedCode(token, "race-revoke@example.com");

    // The only invitation in this test.
    const revocation = await holdOpen(t.db, async (tx) => {
      await tx.update(admissionInvitations).set({ status: "revoked" });
    });
    const joining = join(token, code);
    await lockWaitOn("admission_invitations");
    await revocation.commit();

    const refused = await joining;
    expect(refused.status).toBe(403);
    expect((await problem(refused)).detail).toBe(admissionRefusalDetails.revoked);
    expect(await accountsWith("race-revoke@example.com")).toEqual([]);
    expect((await invitation(id)).status).toBe("revoked");
  });

  test("invitations for different addresses join at the same time", async () => {
    const invited = await Promise.all(
      ["one@example.com", "two@example.com", "three@example.com"].map(async (email) => {
        const { token } = await invite(email);
        return { email, token, code: await emailedCode(token, email) };
      }),
    );
    const responses = await Promise.all(invited.map(({ token, code }) => join(token, code)));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const emails = (await t.db.select().from(users)).map((user) => user.email);
    expect(emails.toSorted()).toEqual(
      ["creator@example.com", ...invited.map(({ email }) => email)].toSorted(),
    );
  });
});
