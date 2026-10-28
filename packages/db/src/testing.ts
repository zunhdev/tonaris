// Integration-test databases: each test gets a fresh schema with every migration applied, in the test database
// on the local Postgres (TS-121). Import from `@tonaris/db/testing`; never from production code.

import postgres from "postgres";

import { createDatabase, type Database } from "./client";
import { redact, testDatabaseUrl } from "./config";
import { ensureDatabase } from "./create-database";
import { migrateDatabase } from "./migrations";

export { ensureDatabase };

/**
 * Creates pg_trgm in the test database's `public` before any schema migrates (TS-50): tests run in parallel, and
 * two migrations creating it at once would collide. One that loses a race finds it made.
 */
async function ensureExtensions(url: string): Promise<void> {
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin`create extension if not exists pg_trgm with schema public`;
  } catch (error) {
    // A concurrent create: the extension's name or type is already taken.
    if (!(error instanceof postgres.PostgresError && ["23505", "42710"].includes(error.code)))
      throw error;
  } finally {
    await admin.end();
  }
}

export type TestDatabase = {
  db: Database;
  /** The schema the tables live in; it is the connections' `search_path`. */
  schema: string;
  /** Closes the connections and drops the schema. */
  drop(): Promise<void>;
};

/** Creates a migrated schema of its own. Call `drop()` when the test is done, for example in `afterEach`. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const url = testDatabaseUrl();
  try {
    await ensureDatabase(url);
    await ensureExtensions(url);
  } catch (error) {
    throw new Error(
      `Integration tests need Postgres 18 at ${redact(url)}: start it (README, Running locally) or set TEST_DATABASE_URL.`,
      { cause: error },
    );
  }

  const schema = `test_${Bun.randomUUIDv7().replaceAll("-", "")}`;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin`create schema ${admin(schema)}`;
  const db = createDatabase(url, { max: 4, connection: { search_path: schema } });
  const drop = async () => {
    await db.$client.end();
    await admin`drop schema if exists ${admin(schema)} cascade`;
    await admin.end();
  };

  try {
    await migrateDatabase(db, { schema });
  } catch (error) {
    await drop();
    throw error;
  }
  return { db, schema, drop };
}
