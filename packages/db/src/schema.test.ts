// Integration tests for the schema and the postgres.js driver against the local Postgres 18 (TS-121).
// Each test runs in its own freshly migrated schema.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";
import postgres from "postgres";

import {
  accountSync,
  albums,
  changeLog,
  containers,
  memberships,
  mutations,
  sessions,
  trashUnits,
  users,
} from "./schema";
import { trimmedCharacters } from "./schema/columns";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const id = () => Bun.randomUUIDv7();

/** Inserts an account and returns its id: owner and person columns reference `user` (TS-11). */
async function newUser(values: Partial<typeof users.$inferInsert> = {}): Promise<string> {
  const userId = id();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com`, ...values });
  return userId;
}

/** The constraint a query violated, or undefined if it succeeded. */
async function violation(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof postgres.PostgresError && cause.constraint_name)
      return cause.constraint_name;
    throw error;
  }
  return undefined;
}

function album(ownerId: string, values: Partial<typeof albums.$inferInsert> = {}) {
  return {
    id: id(),
    ownerId,
    title: "Kind of Blue",
    artistCredit: "Miles Davis",
    originalYear: 1959,
    searchTitleKey: "kind of blue",
    searchArtistKey: "miles davis",
    ...values,
  };
}

async function trashUnit(ownerId: string, rootId: string): Promise<string> {
  const unitId = id();
  const deletedAt = new Date();
  await t.db.insert(trashUnits).values({
    id: unitId,
    ownerId,
    kind: "folder",
    rootId,
    deletedAt,
    expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
  });
  return unitId;
}

describe("migrations", () => {
  test("create the base tables in the target schema", async () => {
    const rows = await t.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = ${t.schema} order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "__drizzle_migrations",
      "account",
      "account_sync",
      "album_field_multi",
      "album_field_values",
      "album_provenance",
      "album_service_links",
      "albums",
      "change_log",
      "containers",
      "field_definitions",
      "field_options",
      "jwks",
      "memberships",
      "mutations",
      "oauth_access_token",
      "oauth_client",
      "oauth_client_assertion",
      "oauth_client_resource",
      "oauth_consent",
      "oauth_refresh_token",
      "oauth_resource",
      "positions",
      "saved_references",
      "session",
      "share_grants",
      "share_links",
      "trash_units",
      "user",
      "verification",
      "view_prefs",
    ]);
  });
});

describe("JSONB round trip", () => {
  test("stores an object once, not as an encoded string", async () => {
    const data = {
      title: "Ágætis byrjun",
      artists: ["Sigur Rós"],
      nested: { year: 1999, live: false, note: null, ratio: 0.5 },
      looksLikeJson: '{"a":1}',
      emoji: "🎷",
    };
    const accountId = await newUser();
    await t.db
      .insert(changeLog)
      .values({ accountId, seq: 1, entity: "album", entityId: id(), op: "upsert", data });

    const [row] = await t.db.select().from(changeLog).where(eq(changeLog.accountId, accountId));
    expect(row?.data).toEqual(data);

    const [stored] = await t.db.execute<{ type: string; year: string; looks: string }>(
      sql`select jsonb_typeof(data) as type, data->'nested'->>'year' as year, data->>'looksLikeJson' as looks
          from change_log where account_id = ${accountId}`,
    );
    expect(stored).toEqual({ type: "object", year: "1999", looks: '{"a":1}' });
  });

  test("stores a top-level string as a JSON string", async () => {
    const mutationId = id();
    await t.db.insert(mutations).values({
      id: mutationId,
      accountId: await newUser(),
      principal: "session",
      name: "album.update",
      status: "confirmed",
      result: "ok",
    });

    const [row] = await t.db.select().from(mutations).where(eq(mutations.id, mutationId));
    expect(row?.result).toBe("ok");
    const [stored] = await t.db.execute<{ type: string }>(
      sql`select jsonb_typeof(result) as type from mutations where id = ${mutationId}`,
    );
    expect(stored?.type).toBe("string");
  });

  test("defaults and round-trips arrays", async () => {
    const ownerId = await newUser();
    const unitId = await trashUnit(ownerId, id());
    const [created] = await t.db.select().from(trashUnits).where(eq(trashUnits.id, unitId));
    expect(created?.tombstones).toEqual([]);

    const tombstones = [{ id: id(), title: "Ágætis byrjun", artist: "Sigur Rós" }];
    await t.db.update(trashUnits).set({ tombstones }).where(eq(trashUnits.id, unitId));
    const [updated] = await t.db.select().from(trashUnits).where(eq(trashUnits.id, unitId));
    expect(updated?.tombstones).toEqual(tombstones);
  });
});

describe("timestamp round trip", () => {
  test("keeps milliseconds and the instant, whatever the session time zone", async () => {
    const deletedAt = new Date("2026-10-18T10:05:19.123Z");
    const unitId = id();
    await t.db.insert(trashUnits).values({
      id: unitId,
      ownerId: await newUser(),
      kind: "album",
      rootId: id(),
      deletedAt,
      expiresAt: new Date("2026-11-17T10:05:19.999Z"),
    });

    const [row] = await t.db.select().from(trashUnits).where(eq(trashUnits.deletedAt, deletedAt));
    expect(row?.id).toBe(unitId);
    expect(row?.deletedAt.toISOString()).toBe("2026-10-18T10:05:19.123Z");
    expect(row?.expiresAt.toISOString()).toBe("2026-11-17T10:05:19.999Z");

    const [utc] = await t.db.execute<{ text: string }>(
      sql`select to_char(deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS') as text
          from trash_units where id = ${unitId}`,
    );
    expect(utc?.text).toBe("2026-10-18T10:05:19.123");

    const elsewhere = await t.db.transaction(async (tx) => {
      await tx.execute(sql`set local time zone 'Pacific/Chatham'`);
      return tx.select().from(trashUnits).where(eq(trashUnits.id, unitId));
    });
    expect(elsewhere[0]?.deletedAt.toISOString()).toBe("2026-10-18T10:05:19.123Z");
  });

  test("database defaults read back exactly, so they can be matched again", async () => {
    const accountId = await newUser();
    const [inserted] = await t.db.insert(accountSync).values({ accountId }).returning();
    if (!inserted) throw new Error("insert returned no row");

    const matches = await t.db
      .select()
      .from(accountSync)
      .where(eq(accountSync.createdAt, inserted.createdAt));
    expect(matches.map((row) => row.accountId)).toEqual([accountId]);
  });
});

describe("account_sync", () => {
  test("hands out increasing seq numbers as JS numbers", async () => {
    const accountId = await newUser();
    await t.db.insert(accountSync).values({ accountId });

    const next = () =>
      t.db
        .update(accountSync)
        .set({ seq: sql`${accountSync.seq} + 1` })
        .where(eq(accountSync.accountId, accountId))
        .returning({ seq: accountSync.seq });
    expect(await next()).toEqual([{ seq: 1 }]);
    expect(await next()).toEqual([{ seq: 2 }]);
  });
});

describe("constraints", () => {
  test("active sibling names are unique per owner, the root included", async () => {
    const ownerId = await newUser();
    const folder = (values: Partial<typeof containers.$inferInsert> = {}) => ({
      id: id(),
      ownerId,
      kind: "folder" as const,
      name: "Jazz",
      nameKey: "jazz",
      ...values,
    });

    const first = folder();
    await t.db.insert(containers).values(first);
    expect(await violation(t.db.insert(containers).values(folder({ name: "JAZZ" })))).toBe(
      "containers_active_sibling_name_key",
    );

    // Another parent, another owner and a trashed sibling don't collide.
    expect(
      await violation(t.db.insert(containers).values(folder({ parentId: first.id }))),
    ).toBeUndefined();
    expect(
      await violation(t.db.insert(containers).values(folder({ ownerId: await newUser() }))),
    ).toBeUndefined();
    const trashed = folder();
    const unitId = await trashUnit(ownerId, trashed.id);
    expect(
      await violation(
        t.db.insert(containers).values({ ...trashed, trashedAt: new Date(), trashUnitId: unitId }),
      ),
    ).toBeUndefined();
  });

  test("trashed rows carry both the time and the unit", async () => {
    expect(
      await violation(
        t.db.insert(containers).values({
          id: id(),
          ownerId: await newUser(),
          kind: "list",
          name: "Later",
          nameKey: "later",
          trashedAt: new Date(),
        }),
      ),
    ).toBe("containers_trash_check");
  });

  test("names must not be blank, Unicode spaces included", async () => {
    const noBreakAndIdeographicSpace = String.fromCodePoint(0xa0, 0x3000);
    const blanks = ["", " \t\n", noBreakAndIdeographicSpace];
    const ownerId = await newUser();
    const violations = await Promise.all(
      blanks.map((name) =>
        violation(
          t.db.insert(containers).values({ id: id(), ownerId, kind: "list", name, nameKey: name }),
        ),
      ),
    );
    expect(violations).toEqual(blanks.map(() => "containers_name_check"));
  });

  test("blank means what JavaScript's trim() removes, whatever the database's locale", async () => {
    const trimmed: number[] = [];
    for (let code = 1; code <= 0xffff; code++) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      if (String.fromCodePoint(code).trim() === "") trimmed.push(code);
    }
    const [row] = await t.db.execute<{ blank: number[] }>(
      sql`select coalesce(array_agg(code order by code), '{}') as blank
          from generate_series(1, 65535) as code
          where code not between 55296 and 57343
            and chr(code) !~ ${sql.raw(`'[^${trimmedCharacters}]'`)}`,
    );
    expect(row?.blank).toEqual(trimmed);
  });

  test("albums need the applicable year", async () => {
    const ownerId = await newUser();
    expect(await violation(t.db.insert(albums).values(album(ownerId)))).toBeUndefined();
    expect(
      await violation(
        t.db
          .insert(albums)
          .values(album(ownerId, { originalYear: null, isLive: true, recordingYearStart: 1964 })),
      ),
    ).toBeUndefined();
    expect(
      await violation(
        t.db
          .insert(albums)
          .values(album(ownerId, { originalYear: null, recordingYearStart: 1964 })),
      ),
    ).toBe("albums_year_check");
    expect(
      await violation(
        t.db
          .insert(albums)
          .values(album(ownerId, { recordingYearStart: 1964, recordingYearEnd: 1963 })),
      ),
    ).toBe("albums_recording_years_check");
  });

  test("purging an album removes its memberships", async () => {
    const ownerId = await newUser();
    const listId = id();
    const purged = album(ownerId);
    const kept = album(ownerId);
    await t.db
      .insert(containers)
      .values({ id: listId, ownerId, kind: "list", name: "Favorites", nameKey: "favorites" });
    await t.db.insert(albums).values([purged, kept]);
    await t.db.insert(memberships).values([
      { listId, albumId: purged.id, ownerId },
      { listId, albumId: kept.id, ownerId },
    ]);

    await t.db.delete(albums).where(eq(albums.id, purged.id));
    const remaining = await t.db.select().from(memberships).where(eq(memberships.listId, listId));
    expect(remaining.map((row) => row.albumId)).toEqual([kept.id]);
  });
});

describe("accounts", () => {
  test("owner and person columns need an existing account", async () => {
    expect(
      await violation(
        t.db
          .insert(containers)
          .values({ id: id(), ownerId: id(), kind: "list", name: "Later", nameKey: "later" }),
      ),
    ).toBe("containers_owner_id_user_id_fkey");
    expect(await violation(t.db.insert(accountSync).values({ accountId: id() }))).toBe(
      "account_sync_account_id_user_id_fkey",
    );
  });

  test("there is at most one creator, and roles are creator or user", async () => {
    await newUser({ role: "creator" });
    expect(await violation(newUser({ role: "creator" }))).toBe("user_single_creator_key");
    expect(await violation(newUser({ role: "user" }))).toBeUndefined();
    expect(
      await violation(
        t.db.execute(
          sql`insert into "user" (id, email, role) values (${id()}, 'x@example.com', 'admin')`,
        ),
      ),
    ).toBe("user_role_check");
  });

  test("emails are unique", async () => {
    await newUser({ email: "anna@example.com" });
    expect(await violation(newUser({ email: "anna@example.com" }))).toBe("user_email_key");
  });

  test("a user with owned data can't be deleted, while their sessions go with them", async () => {
    const userId = await newUser();
    const session = {
      id: id(),
      userId,
      token: id(),
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    await t.db.insert(sessions).values(session);
    await t.db.insert(albums).values(album(userId));

    // Account deletion removes owned data first and the user row last (TS-74).
    expect(await violation(t.db.delete(users).where(eq(users.id, userId)))).toBe(
      "albums_owner_id_user_id_fkey",
    );

    await t.db.delete(albums).where(eq(albums.ownerId, userId));
    await t.db.delete(users).where(eq(users.id, userId));
    expect(await t.db.select().from(sessions).where(eq(sessions.id, session.id))).toEqual([]);
  });
});
