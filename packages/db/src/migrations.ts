// Applying the committed migrations (TS-17), for the pre-deploy command (migrate.ts) and the test databases.
// Pending migrations run in one transaction, so a failed deploy leaves the schema as it was.

import path from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import type { Database } from "./client";

/**
 * Next to `src/`. The production bundle keeps that layout (`bin/` beside `migrations/`), so this holds there
 * too (apps/api/build.ts).
 */
export const migrationsFolder = path.join(import.meta.dir, "../migrations");

/** Applies pending migrations. `schema` also holds the bookkeeping table; the default is `drizzle`. */
export async function migrateDatabase(
  db: Database,
  options: { schema?: string } = {},
): Promise<void> {
  await migrate(db, { migrationsFolder, migrationsSchema: options.schema });
}
