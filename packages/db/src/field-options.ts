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

import type { Database, Transaction } from "./client";
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
    async (tx) => (await optionRemovalsIn(tx, accountId, fieldId, [optionId]))?.removals[0],
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * The removals of `optionIds`, in their order, if they are all options of `accountId`'s field; undefined otherwise.
 * In the caller's transaction, so an approved removal reads them under the owner's lock (TS-64).
 */
export async function optionRemovalsIn(
  tx: Transaction,
  accountId: string,
  fieldId: string,
  optionIds: readonly string[],
): Promise<
  | { field: NonNullable<Awaited<ReturnType<typeof findFieldIn>>>; removals: OptionRemoval[] }
  | undefined
> {
  const field = await findFieldIn(tx, fieldId);
  if (!field || field.ownerId !== accountId) return undefined;
  const removals: OptionRemoval[] = [];
  for (const optionId of optionIds) {
    const option = field.options.find((each) => each.id === optionId);
    if (!option) return undefined;
    // oxlint-disable-next-line no-await-in-loop -- one option at a time, in the caller's transaction
    removals.push(await optionRemoval(field, option, await optionUsersIn(tx, fieldId, optionId)));
  }
  return { field, removals };
}

/** The deletion of the field, if it is `accountId`'s, in the caller's transaction (TS-64). */
export async function fieldDeletionIn(
  tx: Transaction,
  accountId: string,
  fieldId: string,
): Promise<FieldDeletion | undefined> {
  const field = await findFieldIn(tx, fieldId);
  if (!field || field.ownerId !== accountId) return undefined;
  return fieldDeletion(field, await fieldUsersIn(tx, fieldId));
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
