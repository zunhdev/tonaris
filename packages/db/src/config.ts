// Where @tonaris/db connects. Local development and tests default to the native Postgres 18 on
// localhost:5432 (TS-06); production must set DATABASE_URL as a secret (TS-105).

const localDatabaseUrl = "postgres://postgres@localhost:5432/tonaris";
const localTestDatabaseUrl = "postgres://postgres@localhost:5432/tonaris_test";

/** The app database: `DATABASE_URL`, or the local development database outside production. */
export function databaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.NODE_ENV === "production") throw new Error("DATABASE_URL must be set in production");
  return localDatabaseUrl;
}

/** The database integration tests run in, one schema per test (TS-121): `TEST_DATABASE_URL` or the local one. */
export function testDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  return env.TEST_DATABASE_URL || localTestDatabaseUrl;
}
