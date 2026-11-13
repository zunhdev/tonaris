// Database connections: Drizzle over Bun.SQL, Bun's own Postgres client (TS-11). It replaced postgres.js once its
// JSONB and timestamp bugs no longer reproduced on Bun 1.4.4. Every connection opens and closes here, so going back to
// postgres.js is this file, the migrator's import and `postgres-errors.ts` (tech spec stack review), plus the tests'
// raw `db.$client` queries.

import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { databaseUrl } from "./config";

export type Database = ReturnType<typeof createDatabase>;

/** The handle inside `db.transaction(…)`, with the same query methods. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Where a query runs: on its own, or in the caller's transaction. */
export type Executor = Database | Transaction;

/**
 * Runs `read` in one read-only REPEATABLE READ transaction, so its parts are one point in time and agree, as the
 * bootstrap's do (TS-24).
 */
export function readSnapshot<T>(db: Database, read: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(read, { isolationLevel: "repeatable read", accessMode: "read only" });
}

/** A pool's settings, such as `max` connections or the `connection` parameters. */
export type ConnectionOptions = Omit<SQL.PostgresOrMySQLOptions, "url" | "adapter">;

/**
 * A plain connection pool, without Drizzle, for maintenance work that runs outside any schema: creating databases,
 * extensions and the tests' schemas. Close it with `end()`.
 */
export function openConnection(url: string, options: ConnectionOptions = {}): SQL {
  return new SQL(url, options);
}

/** Opens a connection pool. Close it with `closeDatabase`. */
export function createDatabase(url: string = databaseUrl(), options: ConnectionOptions = {}) {
  return drizzle({ client: openConnection(url, options) });
}

/** Closes `db`'s connection pool once its queries in flight finish. */
export async function closeDatabase(db: Database): Promise<void> {
  await db.$client.end();
}
