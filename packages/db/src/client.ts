// Database connections: Drizzle over postgres.js (TS-11). postgres.js rather than Bun.SQL until Bun.SQL's
// JSONB and timestamp bugs are fixed; switching back is this file only (tech spec stack review).

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseUrl } from "./config";

export type Database = ReturnType<typeof createDatabase>;

/** Opens a connection pool. Close it with `db.$client.end()`. */
export function createDatabase(url: string = databaseUrl(), options: postgres.Options<{}> = {}) {
  const client = postgres(url, { onnotice: () => {}, ...options });
  return drizzle({ client });
}
