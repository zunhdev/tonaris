// The creator bootstrap (admission spec, TS-71) against a fresh test schema.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { users } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";

import { insertUser } from "../testing";
import { SeedError, seedCreator } from "./seed-creator";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

/** The explanation a refused seed gives. */
async function refusal(attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
  } catch (error) {
    if (error instanceof SeedError) return error.message;
    throw error;
  }
  throw new Error("The seed was expected to refuse");
}

const accounts = () =>
  t.db.select({ email: users.email, role: users.role, verified: users.emailVerified }).from(users);

describe("seedCreator (TS-71)", () => {
  test("creates the creator with a verified email key on first deploy", async () => {
    const result = await seedCreator(t.db, "  Creator@Example.com ");
    expect(result).toMatchObject({ status: "created", email: "creator@example.com" });
    expect(await accounts()).toEqual([
      { email: "creator@example.com", role: "creator", verified: true },
    ]);
  });

  test("running it again is harmless", async () => {
    const first = await seedCreator(t.db, "creator@example.com");
    const again = await seedCreator(t.db, "CREATOR@example.com");
    expect(again).toEqual({ status: "exists", id: first.id, email: "creator@example.com" });
    expect(await accounts()).toHaveLength(1);
  });

  test("refuses a second creator", async () => {
    await seedCreator(t.db, "creator@example.com");
    expect(await refusal(seedCreator(t.db, "someone@example.com"))).toStartWith(
      "A creator already exists (creator@example.com).",
    );
    expect(await accounts()).toHaveLength(1);
  });

  test("refuses an address that already belongs to an account", async () => {
    await insertUser(t.db, "anna@example.com");
    expect(await refusal(seedCreator(t.db, "Anna@example.com"))).toStartWith(
      "anna@example.com already belongs to an account",
    );
    expect(await accounts()).toEqual([{ email: "anna@example.com", role: "user", verified: true }]);
  });

  test("refuses a missing or invalid CREATOR_EMAIL", async () => {
    const missing = await Promise.all(
      [undefined, "", "   "].map((value) => refusal(seedCreator(t.db, value))),
    );
    expect(missing).toEqual(
      Array.from({ length: 3 }, () => "Set CREATOR_EMAIL to the creator's email address."),
    );
    expect(await refusal(seedCreator(t.db, "not an email"))).toBe(
      'CREATOR_EMAIL is not an email address: "not an email".',
    );
    expect(await accounts()).toEqual([]);
  });
});
