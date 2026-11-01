// The creator's recovery of a sign-in email (FR-11.5, TS-73) against the local Postgres 18: the member list,
// one recovery per account, the codes, and confirming, which swaps the email, ends every session, removes the
// passkeys, disconnects AI connections only when asked, and records the creator's reason.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  cancelEmailRecovery,
  confirmEmailRecovery,
  issueEmailRecovery,
  findMember,
  listMembers,
} from "./email-recoveries";
import {
  auditLog,
  emailRecoveries,
  jobs,
  oauthClients,
  oauthConsents,
  passkeys,
  sessions,
  users,
} from "./schema";
import { createTestDatabase, insertPasskey, type TestDatabase } from "./testing";

let t: TestDatabase;
let creator: string;
let anna: string;

const now = new Date("2026-10-29T12:00:00Z");
const hour = 60 * 60_000;
const later = (ms: number) => new Date(now.getTime() + ms);
const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest();

beforeEach(async () => {
  t = await createTestDatabase();
  creator = Bun.randomUUIDv7();
  anna = Bun.randomUUIDv7();
  await t.db.insert(users).values([
    { id: creator, email: "creator@example.com", role: "creator", createdAt: later(-2 * hour) },
    { id: anna, email: "anna@old.example", displayName: "Anna", createdAt: later(-hour) },
  ]);
});

afterEach(async () => {
  await t.drop();
});

const issue = ({
  newEmailKey = "anna@new.example",
  token = "token-1",
  disconnectConnections = false,
} = {}) =>
  issueEmailRecovery(t.db, {
    userId: anna,
    newEmailKey,
    tokenHash: hash(token),
    codeHash: hash("123456"),
    reason: "Lost her old mailbox; confirmed by phone",
    disconnectConnections,
    requestedBy: creator,
    now,
  });

const confirm = (code = "123456", { token = "token-1", at = now } = {}) =>
  confirmEmailRecovery(t.db, {
    tokenHash: hash(token),
    codeHash: hash(code),
    auditId: Bun.randomUUIDv7(),
    now: at,
  });

async function emailOf(id: string) {
  return (await t.db.select().from(users)).find((user) => user.id === id)?.email;
}

async function connect(userId: string) {
  const clientId = `client-${Bun.randomUUIDv7()}`;
  await t.db.insert(oauthClients).values({ id: Bun.randomUUIDv7(), clientId, redirectUris: [] });
  await t.db
    .insert(oauthConsents)
    .values({ id: Bun.randomUUIDv7(), clientId, userId, scopes: ["collection:read"] });
}

describe("listMembers", () => {
  test("lists accounts oldest first, with email, name, join date and a waiting recovery only", async () => {
    await issue();
    expect(await listMembers(t.db)).toEqual([
      {
        id: creator,
        email: "creator@example.com",
        displayName: null,
        joinedAt: later(-2 * hour),
        recovery: null,
      },
      {
        id: anna,
        email: "anna@old.example",
        displayName: "Anna",
        joinedAt: later(-hour),
        recovery: { newEmailKey: "anna@new.example", requestedAt: expect.any(Date) },
      },
    ]);
  });

  test("findMember reads one account as the list shows it, and nothing for an unknown one", async () => {
    await issue();
    expect(await findMember(t.db, anna)).toEqual((await listMembers(t.db))[1]);
    expect(await findMember(t.db, Bun.randomUUIDv7())).toBeUndefined();
  });
});

describe("issuing", () => {
  test("refuses another account's address and a missing account; a new request replaces the old", async () => {
    expect(await issue({ newEmailKey: "creator@example.com" })).toBe("taken");
    expect(await issue({ newEmailKey: "anna@old.example" })).toBe("same");
    expect(
      await issueEmailRecovery(t.db, {
        userId: Bun.randomUUIDv7(),
        newEmailKey: "x@example.com",
        tokenHash: hash("x"),
        codeHash: hash("x"),
        reason: "x",
        disconnectConnections: false,
        requestedBy: creator,
      }),
    ).toBe("missing");

    expect(await issue()).toBe("issued");
    expect(await issue({ newEmailKey: "anna@newer.example", token: "token-2" })).toBe("issued");
    expect(await confirm("123456", { token: "token-1" })).toEqual({ outcome: "none" });
    expect(await t.db.select().from(emailRecoveries)).toHaveLength(1);
  });

  test("cancelling removes it, and its link stops working", async () => {
    await issue();
    expect(await cancelEmailRecovery(t.db, anna)).toBe(true);
    expect(await confirm()).toEqual({ outcome: "none" });
    expect(await cancelEmailRecovery(t.db, anna)).toBe(false);
  });
});

describe("confirming", () => {
  test("swaps, ends every session, removes passkeys, keeps AI connections, and records the reason", async () => {
    await t.db.insert(sessions).values({
      id: Bun.randomUUIDv7(),
      userId: anna,
      token: "session",
      expiresAt: later(hour),
    });
    await connect(anna);
    await insertPasskey(t.db, anna);
    const creatorsPasskey = await insertPasskey(t.db, creator);
    await issue();

    expect(await confirm()).toEqual({
      outcome: "recovered",
      userId: anna,
      from: "anna@old.example",
      to: "anna@new.example",
    });
    expect(await emailOf(anna)).toBe("anna@new.example");
    expect(await t.db.select().from(sessions)).toEqual([]);
    // Someone who took the old address over may have added one (TON-143); the removal is in the ledger.
    expect((await t.db.select().from(passkeys)).map((row) => row.id)).toEqual([creatorsPasskey]);
    expect((await t.db.select().from(jobs)).map((job) => job.payload)).toEqual([
      expect.objectContaining({ type: "passkey.removed", userId: anna, passkeyId: null }),
    ]);
    expect(await t.db.select().from(oauthConsents)).toHaveLength(1);
    expect(await t.db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        actor: creator,
        action: "email.recover",
        subject: anna,
        details: {
          from: "anna@old.example",
          to: "anna@new.example",
          reason: "Lost her old mailbox; confirmed by phone",
          disconnectedConnections: false,
        },
      }),
    ]);
    expect(await t.db.select().from(emailRecoveries)).toEqual([]);
  });

  test("disconnects AI connections when the creator asked", async () => {
    await connect(anna);
    await connect(creator);
    await issue({ disconnectConnections: true });
    expect((await confirm()).outcome).toBe("recovered");
    expect((await t.db.select().from(oauthConsents)).map((consent) => consent.userId)).toEqual([
      creator,
    ]);
  });

  test("wrong, used-up and expired codes are refused, and an address taken meanwhile refuses the swap", async () => {
    await issue();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop
      expect(await confirm("000000")).toEqual({ outcome: "wrong" });
    }
    expect(await confirm()).toEqual({ outcome: "locked" });

    await issue();
    expect(await confirm("123456", { at: later(24 * hour) })).toEqual({ outcome: "expired" });

    await issue();
    const ben = Bun.randomUUIDv7();
    await t.db.insert(users).values({ id: ben, email: "anna@new.example" });
    expect(await confirm()).toEqual({ outcome: "taken" });
    expect(await emailOf(anna)).toBe("anna@old.example");
    expect(await t.db.select().from(auditLog)).toEqual([]);
  });

  test("a deleted account takes its recovery along", async () => {
    await issue();
    await t.db.delete(users).where(eq(users.id, anna));
    expect(await confirm()).toEqual({ outcome: "none" });
  });
});
