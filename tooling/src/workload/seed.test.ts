// Seeding the reference workload into a fresh test schema (TS-121): the schema accepts every row, and seeding
// again replaces the workload accounts' data without touching anyone else's.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import { albums, containers, memberships, savedReferences, sessions, users } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";

import { generateWorkload } from "./generate";
import { seedWorkload } from "./seed";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const workload = generateWorkload();
const timeout = 30_000;

describe("seedWorkload", () => {
  test(
    "inserts every generated row",
    async () => {
      await seedWorkload(t.db, workload);
      expect(await t.db.$count(users)).toBe(workload.rows.users.length);
      expect(await t.db.$count(containers)).toBe(workload.rows.containers.length);
      expect(await t.db.$count(albums)).toBe(workload.rows.albums.length);
      expect(await t.db.$count(memberships)).toBe(workload.rows.memberships.length);
      expect(await t.db.$count(savedReferences)).toBe(3);
    },
    timeout,
  );

  test(
    "shares 5,000 albums with the owner, found with a recursive query (TS-31)",
    async () => {
      await seedWorkload(t.db, workload);
      const [shared] = await t.db.execute<{ albums: number }>(sql`
        with recursive shared (id) as (
          select container_id from saved_references where viewer_id = ${workload.owner.id}
          union all
          select c.id from containers c join shared s on c.parent_id = s.id
        )
        select count(distinct m.album_id)::int as albums
        from shared s join memberships m on m.list_id = s.id`);
      expect(shared?.albums).toBe(5_000);
    },
    timeout,
  );

  test(
    "replaces the workload accounts' data and leaves other accounts alone",
    async () => {
      const otherId = Bun.randomUUIDv7();
      await t.db.insert(users).values({ id: otherId, email: "someone@example.com" });
      await seedWorkload(t.db, workload);

      // The owner signs in and adds an album; seeding again starts over.
      await t.db.insert(sessions).values({
        id: Bun.randomUUIDv7(),
        userId: workload.owner.id,
        token: "token",
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await t.db.insert(albums).values({
        id: Bun.randomUUIDv7(),
        ownerId: workload.owner.id,
        title: "Extra",
        artistCredit: "Someone",
        originalYear: 2020,
        searchTitleKey: "extra",
        searchArtistKey: "someone",
      });
      await seedWorkload(t.db, workload);

      expect(await t.db.$count(albums)).toBe(workload.rows.albums.length);
      expect(await t.db.$count(sessions)).toBe(0);
      expect(await t.db.select({ id: users.id }).from(users).where(eq(users.id, otherId))).toEqual([
        { id: otherId },
      ]);
    },
    timeout,
  );
});
