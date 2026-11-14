// What removing an option or deleting a field affects, for their confirmations (FR-03.17, FR-03.18, TS-14, DS-60):
// the field, the option or the options, and the albums choosing or applying it, active and in Trash, with the scope's
// hash. The removal or deletion recomputes the scope under the owner's lock and runs only if the hash is the same.

import { count, eq, sql } from "drizzle-orm";

import {
  fieldDeletion,
  openGrantStatuses,
  optionRemoval,
  type FieldDeletion,
  type FieldUsageList,
  type OptionRemoval,
  type OptionUser,
} from "@tonaris/domain";

import { readSnapshot, type Database, type Executor, type Transaction } from "./client";
import { fieldUsersIn, findFieldIn, optionUsersIn } from "./field-values";
import {
  albumFieldValues,
  albums,
  containers,
  fieldDefinitions,
  memberships,
  shareGrants,
  shareLinks,
} from "./schema";

/** The removal of the option, if it is an option of `accountId`'s field; undefined otherwise. */
export async function readOptionRemoval(
  db: Database,
  accountId: string,
  fieldId: string,
  optionId: string,
): Promise<OptionRemoval | undefined> {
  return readSnapshot(
    db,
    async (tx) => (await optionRemovalsIn(tx, accountId, fieldId, [optionId]))?.removals[0],
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
    const users = await optionUsersIn(tx, fieldId, optionId);
    // oxlint-disable-next-line no-await-in-loop -- as above
    const shared = await sharedAmong(tx, accountId, users);
    // oxlint-disable-next-line no-await-in-loop -- as above
    removals.push(await optionRemoval(field, option, users, shared));
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
  const users = await fieldUsersIn(tx, fieldId);
  return fieldDeletion(field, users, await sharedAmong(tx, accountId, users));
}

/**
 * How many of the active `users` are in what `ownerId` shares (FR-03.17, FR-03.18; TON-226): in a list outside Trash
 * that has, or is under a folder that has, an open invitation or a live link.
 */
async function sharedAmong(
  tx: Executor,
  ownerId: string,
  users: readonly OptionUser[],
): Promise<number> {
  const active = users.filter((user) => !user.trashed).map((user) => user.id);
  if (active.length === 0) return 0;
  const [row] = await tx.execute<{ n: number }>(sql`
    with recursive reach as (
      select c.id from ${containers} c
      where c.owner_id = ${ownerId} and c.trashed_at is null and (
        exists (select 1 from ${shareGrants} g
          where g.container_id = c.id and g.status in (${sql.join(
            openGrantStatuses.map((status) => sql`${status}`),
            sql`, `,
          )}))
        or exists (select 1 from ${shareLinks} l where l.container_id = c.id and l.revoked_at is null))
      union
      select c.id from ${containers} c join reach r on c.parent_id = r.id where c.trashed_at is null
    )
    select count(distinct m.album_id)::int as n
    from ${memberships} m join reach r on r.id = m.list_id
    where m.album_id in (${sql.join(
      active.map((id) => sql`${id}`),
      sql`, `,
    )})`);
  return row?.n ?? 0;
}

/** The deletion of the field, if it is `accountId`'s; undefined otherwise. */
export function readFieldDeletion(
  db: Database,
  accountId: string,
  fieldId: string,
): Promise<FieldDeletion | undefined> {
  return readSnapshot(db, (tx) => fieldDeletionIn(tx, accountId, fieldId));
}

/** How many albums apply each of `accountId`'s fields, active and in Trash (DS-60); unused fields count zero. */
export async function readFieldUsage(db: Executor, accountId: string): Promise<FieldUsageList> {
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
