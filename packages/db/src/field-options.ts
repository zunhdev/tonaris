// What removing an option or deleting a field affects, for their confirmations (FR-03.17, FR-03.18, TS-14, DS-60):
// the field, the option or the options, and the albums choosing or applying it, active and in Trash, with the scope's
// hash. The removal or deletion recomputes the scope under the owner's lock and runs only if the hash is the same.

import { count, eq, sql } from "drizzle-orm";

import {
  fieldDeletion,
  optionRemoval,
  type FieldDeletion,
  type FieldUsageList,
  type OptionRemoval,
} from "@tonaris/domain";

import type { Database } from "./client";
import { albumFieldValues, albums, fieldDefinitions } from "./schema";
import { fieldUsersIn, findFieldIn, optionUsersIn } from "./sync";

/** The removal of the option, if it is an option of `accountId`'s field; undefined otherwise. */
export async function readOptionRemoval(
  db: Database,
  accountId: string,
  fieldId: string,
  optionId: string,
): Promise<OptionRemoval | undefined> {
  return db.transaction(
    async (tx) => {
      const field = await findFieldIn(tx, fieldId);
      const option = field?.options.find((each) => each.id === optionId);
      if (!field || field.ownerId !== accountId || !option) return undefined;
      return optionRemoval(field, option, await optionUsersIn(tx, fieldId, optionId));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** The deletion of the field, if it is `accountId`'s; undefined otherwise. */
export async function readFieldDeletion(
  db: Database,
  accountId: string,
  fieldId: string,
): Promise<FieldDeletion | undefined> {
  return db.transaction(
    async (tx) => {
      const field = await findFieldIn(tx, fieldId);
      if (!field || field.ownerId !== accountId) return undefined;
      return fieldDeletion(field, await fieldUsersIn(tx, fieldId));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** How many albums apply each of `accountId`'s fields, active and in Trash (DS-60); unused fields count zero. */
export async function readFieldUsage(db: Database, accountId: string): Promise<FieldUsageList> {
  const trashed = sql<boolean>`${albums.trashedAt} is not null`;
  const [fields, rows] = await Promise.all([
    db
      .select({ id: fieldDefinitions.id })
      .from(fieldDefinitions)
      .where(eq(fieldDefinitions.ownerId, accountId)),
    db
      .select({ fieldId: albumFieldValues.fieldId, trashed, n: count() })
      .from(albumFieldValues)
      .innerJoin(albums, eq(albums.id, albumFieldValues.albumId))
      .where(eq(albums.ownerId, accountId))
      .groupBy(albumFieldValues.fieldId, trashed),
  ]);
  const counted = (fieldId: string, inTrash: boolean) =>
    rows.find((row) => row.fieldId === fieldId && row.trashed === inTrash)?.n ?? 0;
  return {
    fields: fields
      .map(({ id }) => ({ fieldId: id, albums: counted(id, false), inTrash: counted(id, true) }))
      .toSorted((a, b) => (a.fieldId < b.fieldId ? -1 : 1)),
  };
}
