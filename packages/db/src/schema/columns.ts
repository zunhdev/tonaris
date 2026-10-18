// Shared column and constraint helpers for the schema (TS-11).

import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, snakeCase, timestamp } from "drizzle-orm/pg-core";

/** Defines a table whose camelCase column keys map to snake_case column names. */
export const table = snakeCase.table;

/**
 * A `timestamptz` with millisecond precision. JS `Date` and the API's ISO strings (TS-09) hold milliseconds,
 * so a value read back compares equal to what Postgres stored; microseconds would be silently lost.
 */
export const instant = () => timestamp({ withTimezone: true, precision: 3 });

/** `created_at` and `updated_at`, which every table carries (TS-11). */
export const timestamps = {
  createdAt: instant().notNull().defaultNow(),
  updatedAt: instant()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * The characters JavaScript's `trim()` removes (ECMAScript WhiteSpace and LineTerminator), as a regex class body.
 * `isBlankName` in packages/domain uses `trim()`, so the database must agree with it. They are spelled out because
 * `[[:space:]]` follows the database's locale: glibc's doesn't count U+00A0 as a space, macOS's does.
 */
export const trimmedCharacters =
  "\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF";

/** CHECK body: the text column holds something `trim()` would keep (X-06). */
export function notBlank(column: AnyPgColumn): SQL {
  return sql`${column} ~ ${sql.raw(`'[^${trimmedCharacters}]'`)}`;
}

/** CHECK body: the text column holds one of `values` (NULL passes, so pair it with NOT NULL where required). */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "))})`;
}

/** CHECK body for trashable rows: `trashed_at` and `trash_unit_id` are set and cleared together (TS-13). */
export function trashStamp(trashedAt: AnyPgColumn, trashUnitId: AnyPgColumn): SQL {
  return sql`(${trashedAt} is null) = (${trashUnitId} is null)`;
}
