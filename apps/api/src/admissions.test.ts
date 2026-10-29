// Admin → Admissions (FR-11.6, AC-02) against the real app and a fresh test schema: creator-only routes that issue,
// list, resend and revoke email-bound single-use invitations and pause or resume admissions, with the invitation's
// own join flow (TS-71) as the proof of what each one allows.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { z } from "zod";

import { users } from "@tonaris/db";
import {
  admissionAdminRefusalDetails,
  admissionInvitationSchema,
  admissionRefusalDetails,
  admissionsSchema,
  type AdmissionInvitation,
} from "@tonaris/domain";

import { createTestApp, insertUser, inviteForTest, type SentEmail } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let creator: string;
let creatorId: string;

beforeEach(async () => {
  t = await createTestApp();
  creatorId = await insertUser(t.db, "creator@example.com", { role: "creator" });
  ({ cookie: creator } = await t.signIn("creator@example.com"));
});

afterEach(async () => {
  await t.drop();
});

const day = 24 * 60 * 60_000;

/** Calls the admin's routes, as the creator unless `cookie` names someone else, or null for signed out. */
function admin(
  path: string,
  init: { method?: string; json?: unknown; cookie?: string | null } = {},
) {
  const { cookie = creator, ...rest } = init;
  return t.call(`/v1/admin/admissions${path}`, {
    ...rest,
    headers: cookie === null ? {} : { cookie },
  });
}

async function invite(email: string): Promise<AdmissionInvitation> {
  const response = await admin("/invitations", { json: { email } });
  expect(response.status).toBe(201);
  return admissionInvitationSchema.parse(await response.json());
}

async function listing() {
  const response = await admin("");
  expect(response.status).toBe(200);
  return admissionsSchema.parse(await response.json());
}

/** The invitation's delivery once it is no longer sending. */
async function delivery(id: string): Promise<string | null | undefined> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const status = (await listing()).invitations.find((each) => each.id === id)?.emailStatus;
    if (status !== "sending") return status;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(20);
  }
  return "sending";
}

async function statusOf(id: string) {
  return (await listing()).invitations.find((each) => each.id === id)?.status;
}

const problem = async (response: Response) =>
  z.object({ code: z.string(), detail: z.string() }).parse(await response.json());

/** The token in an invitation email's link to `/join/:token`. */
function tokenOf(email: SentEmail): string {
  const link = "link" in email.data ? email.data.link : "";
  const prefix = `${t.config.webOrigin}/join/`;
  expect(link.startsWith(prefix)).toBe(true);
  return decodeURIComponent(link.slice(prefix.length));
}

const requestCode = (token: string) => t.call("/auth/admission/code", { json: { token } });
const join = (token: string, otp: string) =>
  t.call("/auth/admission/join", { json: { token, otp } });

/** Asks for a join code with `token` and returns it from the email to `address`. */
async function joinCode(token: string, address: string): Promise<string> {
  const arrived = t.email.next(address);
  expect((await requestCode(token)).status).toBe(200);
  const email = await arrived;
  if (!("code" in email.data)) throw new Error(`Expected a code, got ${email.template}`);
  return email.data.code;
}

async function accountsWith(email: string) {
  return (await t.db.select().from(users)).filter((user) => user.email === email);
}

describe("access (FR-11.6, X-03)", () => {
  test("only the creator administers admissions", async () => {
    const { id } = await inviteForTest(t.db, { email: "anna@example.com", createdBy: creatorId });
    const { cookie: member } = await t.signIn("member@example.com");
    const calls = [
      { path: "" },
      { path: "/invitations", json: { email: "ben@example.com" } },
      { path: `/invitations/${id}/resend`, json: {} },
      { path: `/invitations/${id}/revoke`, json: {} },
      { path: "/paused", method: "PUT", json: { paused: true } },
    ];
    for (const { path, ...init } of calls) {
      // oxlint-disable-next-line no-await-in-loop
      const asMember = await admin(path, { ...init, cookie: member });
      expect({ path, status: asMember.status }).toEqual({ path, status: 403 });
      // oxlint-disable-next-line no-await-in-loop
      const signedOut = await admin(path, { ...init, cookie: null });
      expect({ path, status: signedOut.status }).toEqual({ path, status: 401 });
    }
    // An MCP client's token never reaches /v1 (TS-62).
    const bearer = await t.call("/v1/admin/admissions", {
      headers: { authorization: "Bearer mcp-token" },
    });
    expect(bearer.status).toBe(401);
    expect((await listing()).paused).toBe(false);
    expect(t.email.sent.filter((email) => email.to === "ben@example.com")).toEqual([]);
  });
});

describe("issuing (FR-11.6)", () => {
  test("an invitation is bound to its address, lasts 14 days, and its email links to its page", async () => {
    const arrived = t.email.next("anna@example.com");
    const invitation = await invite("Anna@Example.com");
    expect(invitation).toMatchObject({
      email: "anna@example.com",
      status: "available",
      redeemedAt: null,
    });
    const lifetime = Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt);
    expect(Math.abs(lifetime - 14 * day)).toBeLessThan(5_000);

    const email = await arrived;
    expect(email.template).toBe("admission-invitation");
    expect(email.subject).toBe("You're invited to join Tonaris");
    expect(await delivery(invitation.id)).toBe("sent");
    expect((await listing()).invitations).toEqual([{ ...invitation, emailStatus: "sent" }]);

    // The link's token joins, and the invitation is then redeemed.
    const token = tokenOf(email);
    const joined = await join(token, await joinCode(token, "anna@example.com"));
    expect(joined.status).toBe(200);
    expect(await accountsWith("anna@example.com")).toHaveLength(1);
    expect((await listing()).invitations[0]).toMatchObject({
      status: "redeemed",
      redeemedAt: expect.any(String),
    });
  });

  test("a member, an address already invited, and a non-address are refused", async () => {
    await insertUser(t.db, "member@example.com");
    await invite("anna@example.com");
    const refusals = [
      ["member@example.com", admissionAdminRefusalDetails.registered("member@example.com")],
      ["ANNA@example.com", admissionAdminRefusalDetails.invited("anna@example.com")],
      ["not an address", admissionAdminRefusalDetails.notEmail],
    ] as const;
    for (const [email, detail] of refusals) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await admin("/invitations", { json: { email } });
      expect(response.status).toBe(422);
      // oxlint-disable-next-line no-await-in-loop
      expect(await problem(response)).toMatchObject({ code: "validation_failed", detail });
    }
    expect((await listing()).invitations).toHaveLength(1);
  });

  test("an expired invitation's address is invited again, and the old one stays expired", async () => {
    const old = await inviteForTest(t.db, {
      email: "late@example.com",
      createdBy: creatorId,
      now: new Date(Date.now() - 15 * day),
    });
    expect(await statusOf(old.id)).toBe("expired");
    const renewed = await invite("late@example.com");
    expect(renewed.status).toBe("available");
    expect(await statusOf(old.id)).toBe("expired");
    // The old link stays refused as expired.
    expect((await requestCode(old.token)).status).toBe(410);
  });
});

describe("delivery and resend (FR-11.6, FR-07.5)", () => {
  test("a failed email shows failed; Resend sends a new link, and the old one stops working", async () => {
    const failedArrival = t.email.next("anna@example.com");
    t.email.failing.add("anna@example.com");
    const invitation = await invite("anna@example.com");
    expect(await delivery(invitation.id)).toBe("failed");
    expect(await statusOf(invitation.id)).toBe("available");

    t.email.failing.delete("anna@example.com");
    const response = await admin(`/invitations/${invitation.id}/resend`, { json: {} });
    expect(response.status).toBe(200);
    const resent = admissionInvitationSchema.parse(await response.json());
    expect(resent).toMatchObject({ status: "available", expiresAt: invitation.expiresAt });
    const token = tokenOf(await failedArrival);
    expect(await delivery(invitation.id)).toBe("sent");

    // Only the resent email's link works.
    expect(t.email.sent.filter((email) => email.to === "anna@example.com")).toHaveLength(1);
    const joined = await join(token, await joinCode(token, "anna@example.com"));
    expect(joined.status).toBe(200);
  });

  test("the earlier link stops working once an invitation is resent", async () => {
    const first = t.email.next("anna@example.com");
    const invitation = await invite("anna@example.com");
    const earlier = tokenOf(await first);
    const second = t.email.next("anna@example.com", 1);
    await admin(`/invitations/${invitation.id}/resend`, { json: {} });
    const latest = tokenOf(await second);
    expect(latest).not.toBe(earlier);

    const refused = await requestCode(earlier);
    expect(refused.status).toBe(404);
    expect((await problem(refused)).detail).toBe(admissionRefusalDetails.invalid);
    expect((await requestCode(latest)).status).toBe(200);
  });
});

describe("revoking (FR-11.6)", () => {
  test("a revoked invitation can't be used, or resent", async () => {
    const invitation = await inviteForTest(t.db, {
      email: "anna@example.com",
      createdBy: creatorId,
    });
    const response = await admin(`/invitations/${invitation.id}/revoke`, { json: {} });
    expect(response.status).toBe(200);
    expect(admissionInvitationSchema.parse(await response.json()).status).toBe("revoked");

    const refused = await requestCode(invitation.token);
    expect(refused.status).toBe(403);
    expect((await problem(refused)).detail).toBe(admissionRefusalDetails.revoked);

    const resend = await admin(`/invitations/${invitation.id}/resend`, { json: {} });
    expect(resend.status).toBe(422);
    expect((await problem(resend)).detail).toBe(admissionAdminRefusalDetails.resendUnavailable);
    expect(t.email.sent.filter((email) => email.to === "anna@example.com")).toEqual([]);
  });

  test("a redeemed invitation isn't revoked, and its account keeps its access", async () => {
    const invitation = await inviteForTest(t.db, {
      email: "anna@example.com",
      createdBy: creatorId,
    });
    expect(
      (await join(invitation.token, await joinCode(invitation.token, "anna@example.com"))).status,
    ).toBe(200);

    const response = await admin(`/invitations/${invitation.id}/revoke`, { json: {} });
    expect(response.status).toBe(422);
    expect((await problem(response)).detail).toBe(admissionAdminRefusalDetails.revokeUnavailable);
    expect(await statusOf(invitation.id)).toBe("redeemed");
    const { cookie } = await t.signIn("anna@example.com");
    expect((await t.call("/v1/me", { headers: { cookie } })).status).toBe(200);

    const unknown = await admin(`/invitations/${Bun.randomUUIDv7()}/revoke`, { json: {} });
    expect(unknown.status).toBe(404);
  });
});

describe("pausing (FR-11.6, FR-11.2)", () => {
  test("pausing keeps members and invitations as they are; resuming lets the invitation work", async () => {
    const invitation = await inviteForTest(t.db, {
      email: "anna@example.com",
      createdBy: creatorId,
    });
    await insertUser(t.db, "member@example.com");

    const paused = await admin("/paused", { method: "PUT", json: { paused: true } });
    expect(await paused.json()).toEqual({ paused: true });
    expect((await listing()).paused).toBe(true);
    const refused = await requestCode(invitation.token);
    expect(refused.status).toBe(403);
    expect((await problem(refused)).detail).toBe(admissionRefusalDetails.paused);
    // Members still sign in, and the invitation is neither redeemed nor revoked.
    const { cookie } = await t.signIn("member@example.com");
    expect((await t.call("/v1/me", { headers: { cookie } })).status).toBe(200);
    expect(await statusOf(invitation.id)).toBe("available");

    await admin("/paused", { method: "PUT", json: { paused: false } });
    expect((await listing()).paused).toBe(false);
    const joined = await join(
      invitation.token,
      await joinCode(invitation.token, "anna@example.com"),
    );
    expect(joined.status).toBe(200);
  });
});

describe("one address, once (FR-11.6, FR-13.5)", () => {
  test("a forwarded invitation's code goes only to its address", async () => {
    const arrived = t.email.next("anna@example.com");
    await invite("anna@example.com");
    const token = tokenOf(await arrived);
    // Ben has the forwarded link: the code still goes to Anna.
    const sent = t.email.sent.length;
    const response = await requestCode(token);
    expect(await response.json()).toEqual({ email: "anna@example.com" });
    await t.email.next("anna@example.com", 2);
    expect(t.email.sent.slice(sent).map((email) => email.to)).toEqual(["anna@example.com"]);
  });

  test("a retried registration creates one account and redeems the invitation once", async () => {
    const invitation = await inviteForTest(t.db, {
      email: "anna@example.com",
      createdBy: creatorId,
    });
    const code = await joinCode(invitation.token, "anna@example.com");
    expect((await join(invitation.token, code)).status).toBe(200);
    const retried = await join(invitation.token, code);
    expect(retried.ok).toBe(false);
    expect(await accountsWith("anna@example.com")).toHaveLength(1);
    expect(await statusOf(invitation.id)).toBe("redeemed");
  });
});
