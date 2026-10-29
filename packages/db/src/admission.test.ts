// The creator's administration of invitations (FR-11.6, TS-71), against the local Postgres 18: who can be invited,
// one available invitation per address, re-issuing after expiry, and which invitations can be resent, revoked
// and expired.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  createAdmissionInvitation,
  expireAdmissionInvitations,
  listAdmissionInvitations,
  revokeAdmissionInvitation,
  rotateAdmissionToken,
} from "./admission";
import { admissionInvitations, users } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let creator: string;

beforeEach(async () => {
  t = await createTestDatabase();
  creator = Bun.randomUUIDv7();
  await t.db.insert(users).values({ id: creator, email: "creator@example.com", role: "creator" });
});

afterEach(async () => {
  await t.drop();
});

const now = new Date("2026-10-29T12:00:00Z");
const day = 24 * 60 * 60_000;
const later = (ms: number) => new Date(now.getTime() + ms);

let tokens = 0;
const tokenHash = () => Buffer.from(`token-${(tokens += 1)}`);

/** Issues an invitation for `emailKey` at `at`, valid for 14 days from then. */
function issue(emailKey: string, at = now) {
  const id = Bun.randomUUIDv7();
  return createAdmissionInvitation(
    t.db,
    {
      id,
      emailKey,
      tokenHash: tokenHash(),
      expiresAt: new Date(at.getTime() + 14 * day),
      createdBy: creator,
      emailStatus: "sending",
    },
    at,
  ).then((issued) => ({ id, issued }));
}

async function statusOf(id: string) {
  const invitations = await t.db.select().from(admissionInvitations);
  return invitations.find((invitation) => invitation.id === id)?.status;
}

describe("createAdmissionInvitation", () => {
  test("issues one available invitation, sending its email", async () => {
    const { id, issued } = await issue("anna@example.com");
    expect(issued).toBe("issued");
    expect(await listAdmissionInvitations(t.db)).toEqual([
      expect.objectContaining({
        id,
        emailKey: "anna@example.com",
        status: "available",
        emailStatus: "sending",
      }),
    ]);
  });

  test("refuses an address that has an account", async () => {
    await t.db.insert(users).values({ id: Bun.randomUUIDv7(), email: "ben@example.com" });
    expect((await issue("ben@example.com")).issued).toBe("registered");
    expect(await listAdmissionInvitations(t.db)).toEqual([]);
  });

  test("refuses a second available invitation, including two at once", async () => {
    await issue("anna@example.com");
    expect((await issue("anna@example.com")).issued).toBe("invited");

    const both = await Promise.all([issue("carl@example.com"), issue("carl@example.com")]);
    expect(both.map(({ issued }) => issued).toSorted()).toEqual(["invited", "issued"]);
    expect(await listAdmissionInvitations(t.db)).toHaveLength(2);
  });

  test("marks an expired invitation's row, then issues a new one", async () => {
    const old = await issue("anna@example.com", later(-15 * day));
    const renewed = await issue("anna@example.com");
    expect(renewed.issued).toBe("issued");
    expect(await statusOf(old.id)).toBe("expired");
    expect(await statusOf(renewed.id)).toBe("available");
  });
});

describe("listAdmissionInvitations", () => {
  test("lists the newest first", async () => {
    const first = await issue("anna@example.com");
    const second = await issue("ben@example.com");
    expect((await listAdmissionInvitations(t.db)).map((row) => row.id)).toEqual([
      second.id,
      first.id,
    ]);
  });
});

describe("rotateAdmissionToken and revokeAdmissionInvitation", () => {
  test("rotate gives a usable invitation a new token, sending again, with its expiry kept", async () => {
    const { id } = await issue("anna@example.com");
    await t.db.update(admissionInvitations).set({ emailStatus: "failed" });
    const hash = Buffer.from("rotated");
    const rotated = await rotateAdmissionToken(t.db, id, { tokenHash: hash, now });
    expect(rotated).toMatchObject({ tokenHash: hash, emailStatus: "sending", status: "available" });
    expect(rotated?.expiresAt).toEqual(later(14 * day));
  });

  test("only a usable invitation is rotated or revoked", async () => {
    const revoked = await issue("revoked@example.com");
    expect(await revokeAdmissionInvitation(t.db, revoked.id, now)).toMatchObject({
      status: "revoked",
    });
    const expired = await issue("expired@example.com", later(-15 * day));
    const redeemed = await issue("redeemed@example.com");
    await t.db
      .update(admissionInvitations)
      .set({ status: "redeemed", redeemedAt: now })
      .where(eq(admissionInvitations.id, redeemed.id));

    for (const { id } of [revoked, expired, redeemed]) {
      // oxlint-disable-next-line no-await-in-loop
      expect(await rotateAdmissionToken(t.db, id, { tokenHash: tokenHash(), now })).toBeUndefined();
      // oxlint-disable-next-line no-await-in-loop
      expect(await revokeAdmissionInvitation(t.db, id, now)).toBeUndefined();
    }
    expect(await statusOf(redeemed.id)).toBe("redeemed");
    expect(await statusOf(expired.id)).toBe("available");
  });
});

describe("expireAdmissionInvitations", () => {
  test("records available invitations past their expiry, and nothing else", async () => {
    const past = await issue("past@example.com", later(-14 * day));
    const current = await issue("current@example.com", later(-14 * day + 1));
    const revoked = await issue("revoked@example.com", later(-20 * day));
    await revokeAdmissionInvitation(t.db, revoked.id, later(-20 * day));

    await expireAdmissionInvitations(t.db, now);
    expect(await statusOf(past.id)).toBe("expired");
    expect(await statusOf(current.id)).toBe("available");
    expect(await statusOf(revoked.id)).toBe("revoked");
  });
});
