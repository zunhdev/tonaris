// Custom fields and their values as stored (TS-11, TS-14; FR-03.6–FR-03.18): a field with its options in order, the
// account's fields, and the codec between a value and its typed column, with a multiple choice's selections in
// `album_field_multi`. The store's field commands and the reads of values share it.

import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";

import {
  fieldValueKey,
  type CustomField,
  type FieldType,
  type FieldValue,
  type FieldValueData,
  type OptionUser,
  type StoredField,
} from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import {
  albumFieldMulti,
  albumFieldValues,
  albums,
  fieldDefinitions,
  fieldOptions,
} from "./schema";

/** A field with its owner and its options in order: keys compare bytewise (TS-16). */
export async function findFieldIn(
  tx: Transaction | Database,
  id: string,
): Promise<StoredField | undefined> {
  const [row] = await tx
    .select({
      id: fieldDefinitions.id,
      ownerId: fieldDefinitions.ownerId,
      name: fieldDefinitions.name,
      type: fieldDefinitions.type,
    })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.id, id));
  if (!row) return undefined;
  const options = await tx
    .select({ id: fieldOptions.id, label: fieldOptions.label })
    .from(fieldOptions)
    .where(eq(fieldOptions.fieldId, id))
    .orderBy(sql`${fieldOptions.sortKey} collate "C"`, asc(fieldOptions.id));
  return { ...row, options };
}

/** The account's custom fields, each with its options in order, as clients hold them (FR-03.6). */
export async function fieldsOfAccount(tx: Transaction, accountId: string): Promise<CustomField[]> {
  const definitions = await tx
    .select({ id: fieldDefinitions.id, name: fieldDefinitions.name, type: fieldDefinitions.type })
    .from(fieldDefinitions)
    .where(eq(fieldDefinitions.ownerId, accountId))
    .orderBy(asc(fieldDefinitions.id));
  if (definitions.length === 0) return [];
  const options = await tx
    .select({ id: fieldOptions.id, fieldId: fieldOptions.fieldId, label: fieldOptions.label })
    .from(fieldOptions)
    .where(
      inArray(
        fieldOptions.fieldId,
        definitions.map((definition) => definition.id),
      ),
    )
    .orderBy(sql`${fieldOptions.sortKey} collate "C"`, asc(fieldOptions.id));
  const byField = Map.groupBy(options, (option) => option.fieldId);
  return definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    type: definition.type,
    options: (byField.get(definition.id) ?? []).map(({ id, label }) => ({ id, label })),
  }));
}

/** The columns a value is stored in (TS-11). */
export const valueColumns = {
  albumId: albumFieldValues.albumId,
  fieldId: albumFieldValues.fieldId,
  textValue: albumFieldValues.textValue,
  numberValue: albumFieldValues.numberValue,
  dateValue: albumFieldValues.dateValue,
  boolValue: albumFieldValues.boolValue,
  optionId: albumFieldValues.optionId,
};

export const emptyValue = {
  textValue: null,
  numberValue: null,
  dateValue: null,
  boolValue: null,
  optionId: null,
};

export type ValueRow = typeof emptyValue extends infer T
  ? { [K in keyof T]: K extends "boolValue" ? boolean | null : string | null }
  : never;

/** The column a value of `type` goes in (TS-11); a multiple choice keeps its selections in `album_field_multi`. */
export function columnsOf(type: FieldType, value: FieldValueData): Partial<ValueRow> {
  if (value === null || Array.isArray(value)) return {};
  if (type === "yes_no") return typeof value === "boolean" ? { boolValue: value } : {};
  if (typeof value !== "string") return {};
  if (type === "text") return { textValue: value };
  if (type === "number") return { numberValue: value };
  if (type === "date") return { dateValue: value };
  return { optionId: value };
}

/** A stored value as clients hold it: null when applied-empty (FR-03.7). */
export function valueOf(row: ValueRow & { type: FieldType }, selected: string[]): FieldValueData {
  const { type } = row;
  if (type === "text") return row.textValue;
  if (type === "number") return row.numberValue;
  if (type === "date") return row.dateValue;
  if (type === "yes_no") return row.boolValue;
  if (type === "single_choice") return row.optionId;
  // A multiple choice keeps its selections in `album_field_multi`.
  return selected.length > 0 ? selected : null;
}

/** Multiple-choice selections, in their options' order (TS-16), for the albums `where` picks. */
export function selectionsOf(tx: Transaction, where: SQL | undefined, fieldId?: string) {
  return tx
    .select({
      albumId: albumFieldMulti.albumId,
      fieldId: albumFieldMulti.fieldId,
      optionId: albumFieldMulti.optionId,
    })
    .from(albumFieldMulti)
    .innerJoin(fieldOptions, eq(fieldOptions.id, albumFieldMulti.optionId))
    .where(fieldId === undefined ? where : and(where, eq(albumFieldMulti.fieldId, fieldId)))
    .orderBy(sql`${fieldOptions.sortKey} collate "C"`, asc(fieldOptions.id));
}

/** Selections grouped once by album and field (`fieldValueKey`), each group still in its options' order. */
export function selectedBy(
  selections: readonly { albumId: string; fieldId: string; optionId: string }[],
): Map<string, string[]> {
  const selected = new Map<string, string[]>();
  for (const { albumId, fieldId, optionId } of selections) {
    const key = fieldValueKey(albumId, fieldId);
    const chosen = selected.get(key);
    if (chosen) chosen.push(optionId);
    else selected.set(key, [optionId]);
  }
  return selected;
}

/** The albums applying the field, even empty, in Trash or not (FR-03.18). */
export function fieldUsersIn(tx: Transaction | Database, fieldId: string): Promise<OptionUser[]> {
  return tx
    .select({ id: albums.id, trashed: sql<boolean>`${albums.trashedAt} is not null` })
    .from(albumFieldValues)
    .innerJoin(albums, eq(albums.id, albumFieldValues.albumId))
    .where(eq(albumFieldValues.fieldId, fieldId));
}

/** The albums choosing the option, single or multiple choice, in Trash or not (FR-03.17). */
export async function optionUsersIn(
  tx: Transaction | Database,
  fieldId: string,
  optionId: string,
): Promise<OptionUser[]> {
  const trashed = sql<boolean>`${albums.trashedAt} is not null`;
  const single = await tx
    .select({ id: albums.id, trashed })
    .from(albumFieldValues)
    .innerJoin(albums, eq(albums.id, albumFieldValues.albumId))
    .where(and(eq(albumFieldValues.fieldId, fieldId), eq(albumFieldValues.optionId, optionId)));
  const multiple = await tx
    .select({ id: albums.id, trashed })
    .from(albumFieldMulti)
    .innerJoin(albums, eq(albums.id, albumFieldMulti.albumId))
    .where(and(eq(albumFieldMulti.fieldId, fieldId), eq(albumFieldMulti.optionId, optionId)));
  return [...single, ...multiple];
}

/** The fields the account's albums apply, with their values, Trash included (FR-03.7). */
export function valuesOfAccount(tx: Transaction, accountId: string): Promise<FieldValue[]> {
  return valuesWhere(tx, eq(albums.ownerId, accountId));
}

/** The field values of the albums `ids`, for a shared snapshot (TON-64). */
export async function valuesOfAlbums(
  tx: Transaction,
  ids: readonly string[],
): Promise<FieldValue[]> {
  return ids.length === 0 ? [] : valuesWhere(tx, inArray(albums.id, [...ids]));
}

/** The field values of the albums `albumWhere` picks, as clients hold them (FR-03.7). */
async function valuesWhere(tx: Transaction, albumWhere: SQL): Promise<FieldValue[]> {
  const rows = await tx
    .select({ ...valueColumns, type: fieldDefinitions.type })
    .from(albumFieldValues)
    .innerJoin(albums, eq(albums.id, albumFieldValues.albumId))
    .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, albumFieldValues.fieldId))
    .where(albumWhere)
    .orderBy(asc(albumFieldValues.albumId), asc(albumFieldValues.fieldId));
  const selected = selectedBy(
    await selectionsOf(
      tx,
      inArray(albumFieldMulti.albumId, tx.select({ id: albums.id }).from(albums).where(albumWhere)),
    ),
  );
  return rows.map((row) => ({
    albumId: row.albumId,
    fieldId: row.fieldId,
    value: valueOf(row, selected.get(fieldValueKey(row.albumId, row.fieldId)) ?? []),
  }));
}
