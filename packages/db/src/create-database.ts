// Creates the local development and test databases on the native Postgres (TS-06).
// Production databases come from the host and are never created here.
// Run with `bun run db:create`; the integration tests call ensureDatabase themselves.

import postgres from "postgres";

import { databaseUrl, redact, testDatabaseUrl } from "./config";

/** Creates the database named in `url` unless it exists. Returns whether it was created. */
export async function ensureDatabase(url: string): Promise<boolean> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!name) throw new Error(`No database name in ${redact(url)}`);

  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const sql = postgres(maintenance.href, { max: 1, onnotice: () => {} });
  try {
    const [existing] = await sql`select 1 from pg_database where datname = ${name}`;
    if (existing) return false;
    try {
      await sql`create database ${sql(name)}`;
      return true;
    } catch (error) {
      // Another process created it between the check and the create.
      if (error instanceof postgres.PostgresError && error.code === "42P04") return false;
      throw error;
    }
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  const urls = [databaseUrl(), testDatabaseUrl()];
  const created = await Promise.all(urls.map(ensureDatabase));
  urls.forEach((url, i) => console.log(`${created[i] ? "Created" : "Exists:"} ${redact(url)}`));
}
