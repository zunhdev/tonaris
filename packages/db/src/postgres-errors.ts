// Postgres errors as Bun.SQL reports them (TS-11), whether or not Drizzle wrapped them in a `DrizzleQueryError`.
// Bun.SQL keeps Postgres's SQLSTATE in `errno` and the constraint's name in `constraint`; its `code` is Bun's own
// (`ERR_POSTGRES_SERVER_ERROR`).

import { SQL } from "bun";

/** The Postgres error in `error` or its causes, if there is one. */
export function postgresError(error: unknown): SQL.PostgresError | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof SQL.PostgresError) return current;
    current = current.cause;
  }
  return undefined;
}

/** The SQLSTATE of the Postgres error in `error`, such as `23505` for a unique violation. */
export function sqlState(error: unknown): string | undefined {
  return postgresError(error)?.errno;
}
