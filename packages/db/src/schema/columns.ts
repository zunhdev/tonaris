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

/** CHECK body: the text column holds something other than whitespace, Unicode spaces included. */
export function notBlank(column: AnyPgColumn): SQL {
  return sql`${column} ~ '[^[:space:]]'`;
}

/** CHECK body: the text column holds one of `values` (NULL passes, so pair it with NOT NULL where required). */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "))})`;
}

/** CHECK body for trashable rows: `trashed_at` and `trash_unit_id` are set and cleared together (TS-13). */
export function trashStamp(trashedAt: AnyPgColumn, trashUnitId: AnyPgColumn): SQL {
  return sql`(${trashedAt} is null) = (${trashUnitId} is null)`;
}
