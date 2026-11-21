// The demo collection (TON-308) in a fresh test schema (TS-121): the schema takes every row, the collection is what
// the pictures need, and seeding again replaces the demo accounts' data without touching anyone else's.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { albums, containers, savedReferences, shareGrants, users } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { nameKey } from "@tonaris/domain";

import { coverUrl, demoEmails, generateDemo } from "./collection";
import { seedDemo } from "./seed";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const demo = generateDemo();

describe("generateDemo", () => {
  test("is the same every time", () => {
    expect(generateDemo()).toEqual(demo);
  });

  test("names are unique among siblings (X-06)", () => {
    const keys = demo.rows.containers.map((c) => `${c.ownerId}/${c.parentId}/${nameKey(c.name)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("every album has a cover of its own, and Unsorted holds two of Robin's", () => {
    const covers = demo.rows.albums.map((album) => album.artworkUrl);
    expect(new Set(covers).size).toBe(covers.length);
    expect(covers).toContain(coverUrl("bluehour"));
    const robins = demo.rows.albums.filter((album) => album.ownerId === demo.owner.id);
    const listed = new Set(demo.rows.memberships.map((m) => m.albumId));
    expect(robins.filter((album) => !listed.has(album.id)).map((a) => a.title)).toEqual([
      "Midnight Ferry",
      "Slow Orbit",
    ]);
  });
});

describe("seedDemo", () => {
  test("inserts every row, and shares as the pictures need", async () => {
    await seedDemo(t.db, demo);
    expect(await t.db.$count(users)).toBe(3);
    expect(await t.db.$count(albums)).toBe(demo.rows.albums.length);
    expect(await t.db.$count(containers)).toBe(demo.rows.containers.length);
    const sam = await t.db.select().from(users).where(eq(users.email, demoEmails.sam));
    const grants = await t.db.select().from(shareGrants);
    expect(grants.map((grant) => [grant.granteeId === sam[0]?.id, grant.role])).toContainEqual([
      true,
      "edit",
    ]);
    expect(await t.db.$count(savedReferences)).toBe(2);
  });

  test("seeding again replaces the demo's data and keeps everyone else's", async () => {
    const [other] = await t.db
      .insert(users)
      .values({ id: crypto.randomUUID(), email: "someone@else.test", emailVerified: true })
      .returning();
    await seedDemo(t.db, demo);
    await seedDemo(t.db, demo);
    expect(await t.db.$count(albums)).toBe(demo.rows.albums.length);
    expect(await t.db.$count(users, eq(users.id, other?.id ?? ""))).toBe(1);
  });
});
