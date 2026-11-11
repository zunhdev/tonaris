// Applying the committed migrations (TS-17), for the pre-deploy command (migrate.ts) and the test databases.
// Pending migrations run in one transaction, so a failed deploy leaves the schema as it was. Then the search keys
// that SQL can't compute (TS-12) are filled in for rows a migration added a key column to.

import path from "node:path";

import { eq, or, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { latinKey } from "@tonaris/domain";

import type { Database } from "./client";
import { albums, containers } from "./schema";

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

/** `rows` in slices of `chunk`, for updates of bounded size. */
const chunked = <T>(rows: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(rows.length / chunk) }, (_, n) =>
    rows.slice(n * chunk, (n + 1) * chunk),
  );

/**
 * Sets every search key that is still empty (TS-12): the TON-62 migration left containers' empty, and the TON-201
 * one emptied them all when the keys gained Latin spellings. Idempotent, so an interrupted run finishes on the next;
 * a text whose key really is empty is only ever rewritten as it was.
 */
export async function fillSearchKeys(db: Database): Promise<number> {
  const [names, records] = await Promise.all([
    db
      .select({ id: containers.id, name: containers.name })
      .from(containers)
      .where(eq(containers.searchNameKey, "")),
    db
      .select({ id: albums.id, title: albums.title, artistCredit: albums.artistCredit })
      .from(albums)
      .where(or(eq(albums.searchTitleKey, ""), eq(albums.searchArtistKey, ""))),
  ]);
  const keyedNames = names
    .map(({ id, name }) => ({ id, key: latinKey(name) }))
    .filter(({ key }) => key !== "");
  const keyedAlbums = records
    .map(({ id, title, artistCredit }) => ({
      id,
      title: latinKey(title),
      artist: latinKey(artistCredit),
    }))
    .filter(({ title, artist }) => title !== "" || artist !== "");
  await Promise.all([
    ...chunked(keyedNames).map((rows) => {
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
    ...chunked(keyedAlbums).map((rows) => {
      const values = sql.join(
        rows.map(({ id, title, artist }) => sql`(${id}::uuid, ${title}, ${artist})`),
        sql`, `,
      );
      return db.execute(sql`
        update ${albums} set search_title_key = v.title, search_artist_key = v.artist
        from (values ${values}) as v (id, title, artist)
        where ${albums.id} = v.id
      `);
    }),
  ]);
  return keyedNames.length + keyedAlbums.length;
}
