// Custom field definitions, options and per-album values (TS-11, TS-14; FR-03.6–FR-03.18).
// Owner columns reference `user` with NO ACTION, like the collection's (TS-74).

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { albums } from "./collection";
import { notBlank, oneOf, table, timestamps } from "./columns";

export const fieldTypes = [
  "text",
  "number",
  "date",
  "yes_no",
  "single_choice",
  "multiple_choice",
] as const;

/** Account-level field definitions; names are unique per owner across types (FR-03.9). */
export const fieldDefinitions = table(
  "field_definitions",
  {
    id: uuid().primaryKey(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    name: text().notNull(),
    nameKey: text().notNull(),
    type: text({ enum: fieldTypes }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.ownerId, t.nameKey),
    check("field_definitions_name_check", notBlank(t.name)),
    check("field_definitions_type_check", oneOf(t.type, fieldTypes)),
  ],
);

/** Options of a choice field (FR-03.14–FR-03.16). */
export const fieldOptions = table(
  "field_options",
  {
    id: uuid().primaryKey(),
    fieldId: uuid()
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    label: text().notNull(),
    labelKey: text().notNull(),
    // Fractional index (TS-16). Compare bytewise (JS `<`, or SQL `COLLATE "C"`), never by the database locale.
    sortKey: text().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex().on(t.fieldId, t.labelKey),
    check("field_options_label_check", notBlank(t.label)),
  ],
);

/**
 * A row means the field is applied to the album; a row with every value null is applied-empty; no row is
 * unused (FR-03.7). Which value column matches the field's type is checked by the domain command.
 */
export const albumFieldValues = table(
  "album_field_values",
  {
    albumId: uuid()
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    fieldId: uuid()
      .notNull()
      .references(() => fieldDefinitions.id, { onDelete: "cascade" }),
    textValue: text(),
    // Strings keep the stored decimal exact.
    numberValue: numeric(),
    // `YYYY-MM-DD` strings: a calendar date has no time zone to shift.
    dateValue: date(),
    boolValue: boolean(),
    optionId: uuid().references(() => fieldOptions.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.fieldId] }),
    // Type changes check whether any value exists for the field (TS-14).
    index().on(t.fieldId),
    index().on(t.optionId),
    check(
      "album_field_values_single_value_check",
      sql`num_nonnulls(${t.textValue}, ${t.numberValue}, ${t.dateValue}, ${t.boolValue}, ${t.optionId}) <= 1`,
    ),
  ],
);

/** Multiple-choice selections; the parent `album_field_values` row marks the field as applied (FR-03.10). */
export const albumFieldMulti = table(
  "album_field_multi",
  {
    albumId: uuid().notNull(),
    fieldId: uuid().notNull(),
    optionId: uuid()
      .notNull()
      .references(() => fieldOptions.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.fieldId, t.optionId] }),
    foreignKey({
      name: "album_field_multi_value_fkey",
      columns: [t.albumId, t.fieldId],
      foreignColumns: [albumFieldValues.albumId, albumFieldValues.fieldId],
    }).onDelete("cascade"),
    index().on(t.optionId),
  ],
);
