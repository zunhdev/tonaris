// Applying the committed migrations (TS-17), for the pre-deploy command (migrate.ts) and the test databases.
// Pending migrations run in one transaction, so a failed deploy leaves the schema as it was. Then the search keys
// that SQL can't compute (TS-12) are filled in for rows a migration added a key column to.

import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { searchKey } from "@tonaris/domain";

import type { Database } from "./client";
import { containers } from "./schema";

/**
 * Next to `src/`. The production bundle keeps that layout (`bin/` beside `migrations/`), so this holds there
 * too (apps/api/build.ts).
 */
export const migrationsFolder = path.join(import.meta.dir, "../migrations");

/** Applies pending migrations, then fills in missing search keys. `schema` also holds the bookkeeping table. */
export async function migrateDatabase(
  db: Database,
  options: { schema?: string } = {},
): Promise<void> {
  await migrate(db, { migrationsFolder, migrationsSchema: options.schema });
  await fillSearchKeys(db);
}

const chunk = 500;

/**
 * Sets each container's search key that is still empty, as the TON-62 migration left them (TS-12). Idempotent, so
 * an interrupted run finishes on the next; a name whose key really is empty is only ever rewritten as it was.
 */
export async function fillSearchKeys(db: Database): Promise<number> {
  const missing = await db
    .select({ id: containers.id, name: containers.name })
    .from(containers)
    .where(eq(containers.searchNameKey, ""));
  const keyed = missing
    .map(({ id, name }) => ({ id, key: searchKey(name) }))
    .filter(({ key }) => key !== "");
  const chunks = Array.from({ length: Math.ceil(keyed.length / chunk) }, (_, n) =>
    keyed.slice(n * chunk, (n + 1) * chunk),
  );
  await Promise.all(
    chunks.map((rows) => {
      const values = sql.join(
        rows.map(({ id, key }) => sql`(${id}::uuid, ${key})`),
        sql`, `,
      );
      return db.execute(sql`
        update ${containers} set search_name_key = v.key
        from (values ${values}) as v (id, key)
        where ${containers.id} = v.id
      `);
    }),
  );
  return keyed.length;
}
