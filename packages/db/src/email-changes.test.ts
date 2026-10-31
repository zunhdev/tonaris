// The sign-in email change's storage (FR-11.4, TS-73) against the local Postgres 18: one change per account,
// wrong, expired and used-up codes, the two steps, and the swap with its sessions and audit log. Passkeys stay.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  cancelEmailChange,
  findEmailChange,
  renewEmailChangeCode,
  startEmailChange,
  submitEmailChangeCode,
} from "./email-changes";
import { auditLog, passkeys, sessions, users } from "./schema";
import { createTestDatabase, insertPasskey, type TestDatabase } from "./testing";

let t: TestDatabase;
let anna: string;

const now = new Date("2026-10-29T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const hash = (code: string) => new Bun.CryptoHasher("sha256").update(code).digest();

beforeEach(async () => {
  t = await createTestDatabase();
  anna = Bun.randomUUIDv7();
  await t.db.insert(users).values({ id: anna, email: "anna@example.com", emailVerified: true });
});

afterEach(async () => {
  await t.drop();
});

/** A session of Anna's, as Better Auth stores it. */
async function session(): Promise<string> {
  const id = Bun.randomUUIDv7();
  await t.db
    .insert(sessions)
    .values({ id, userId: anna, token: id, expiresAt: later(24 * 60 * 60_000) });
  return id;
}

const start = (newEmailKey = "anna@new.example", code = "111111") =>
  startEmailChange(t.db, { userId: anna, newEmailKey, codeHash: hash(code), now });

const submit = (code: string, { sessionId = Bun.randomUUIDv7(), at = now } = {}) =>
  submitEmailChangeCode(t.db, {
    userId: anna,
    sessionId,
    codeHash: hash(code),
    nextCodeHash: hash("222222"),
    auditId: Bun.randomUUIDv7(),
    now: at,
  });

async function emailOf(id: string) {
  return (await t.db.select().from(users)).find((each) => each.id === id)?.email;
}

describe("starting", () => {
  test("starts at the current address's step, and starting again replaces it", async () => {
    expect(await start()).toBe("started");
    expect(await findEmailChange(t.db, anna)).toMatchObject({
      newEmailKey: "anna@new.example",
      stage: "current",
      attempts: 0,
    });
    expect(await start("anna@other.example", "333333")).toBe("started");
    expect((await findEmailChange(t.db, anna))?.newEmailKey).toBe("anna@other.example");
    // The first change's code stopped working.
    expect(await submit("111111")).toEqual({ outcome: "wrong" });
  });

  test("refuses another account's address", async () => {
    await t.db.insert(users).values({ id: Bun.randomUUIDv7(), email: "ben@example.com" });
    expect(await start("ben@example.com")).toBe("taken");
    expect(await findEmailChange(t.db, anna)).toBeUndefined();
  });
});

describe("codes", () => {
  test("a wrong code counts, the fifth locks the code, and a renewed one works again", async () => {
    await start();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop
      expect(await submit("999999")).toEqual({ outcome: "wrong" });
    }
    expect(await submit("111111")).toEqual({ outcome: "locked" });

    await renewEmailChangeCode(t.db, { userId: anna, codeHash: hash("444444"), now });
    expect((await submit("444444")).outcome).toBe("advanced");
  });

  test("an expired code is refused, and no change is none", async () => {
    await start();
    expect(await submit("111111", { at: later(10 * 60_000) })).toEqual({ outcome: "expired" });
    await cancelEmailChange(t.db, anna);
    expect(await submit("111111")).toEqual({ outcome: "none" });
    expect(await emailOf(anna)).toBe("anna@example.com");
  });
});

describe("the two steps and the swap", () => {
  test("the current code moves on; the new code swaps, ends only other sessions, keeps passkeys, and records it", async () => {
    const here = await session();
    const elsewhere = await session();
    const passkey = await insertPasskey(t.db, anna);
    await start();
    const advanced = await submit("111111", { sessionId: here });
    expect(advanced).toMatchObject({ outcome: "advanced", change: { stage: "new" } });
    expect(await emailOf(anna)).toBe("anna@example.com");

    expect(await submit("222222", { sessionId: here })).toEqual({
      outcome: "changed",
      from: "anna@example.com",
      to: "anna@new.example",
    });
    expect(await emailOf(anna)).toBe("anna@new.example");
    expect((await t.db.select().from(sessions)).map((each) => each.id)).toEqual([here]);
    // The person proved both addresses, so their passkeys keep working (TON-143).
    expect((await t.db.select().from(passkeys)).map((each) => each.id)).toEqual([passkey]);
    expect(await t.db.select().from(auditLog)).toEqual([
      expect.objectContaining({
        actor: anna,
        action: "email.change",
        subject: anna,
        details: { from: "anna@example.com", to: "anna@new.example" },
        at: now,
      }),
    ]);
    expect(await findEmailChange(t.db, anna)).toBeUndefined();
    expect(elsewhere).not.toBe(here);
  });

  test("an address taken meanwhile refuses the swap and changes neither account", async () => {
    await start();
    await submit("111111");
    const ben = Bun.randomUUIDv7();
    await t.db.insert(users).values({ id: ben, email: "anna@new.example" });
    expect(await submit("222222")).toEqual({ outcome: "taken" });
    expect(await emailOf(anna)).toBe("anna@example.com");
    expect(await emailOf(ben)).toBe("anna@new.example");
    expect(await t.db.select().from(auditLog)).toEqual([]);
    expect(await findEmailChange(t.db, anna)).toBeUndefined();
  });

  test("two right codes at once swap once", async () => {
    await start();
    await submit("111111");
    const outcomes = await Promise.all([submit("222222"), submit("222222")]);
    expect(outcomes.map(({ outcome }) => outcome).toSorted()).toEqual(["changed", "none"]);
    expect(await t.db.select().from(auditLog)).toHaveLength(1);
  });
});
