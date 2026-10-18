// Applies the committed migrations (TS-17). The host's pre-deploy step runs `bun run db:migrate` (TS-110).
// Pending migrations run in one transaction, so a failed deploy leaves the schema as it was.

import path from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDatabase, type Database } from "./client";
import { databaseUrl } from "./config";
import { redact } from "./create-database";

export const migrationsFolder = path.join(import.meta.dir, "../migrations");

/** Applies pending migrations. `schema` also holds the bookkeeping table; the default is `drizzle`. */
export async function migrateDatabase(
  db: Database,
  options: { schema?: string } = {},
): Promise<void> {
  await migrate(db, { migrationsFolder, migrationsSchema: options.schema });
}

if (import.meta.main) {
  const url = databaseUrl();
  const db = createDatabase(url, { max: 1 });
  try {
    await migrateDatabase(db);
    console.log(`Migrated ${redact(url)}`);
  } finally {
    await db.$client.end();
  }
}
