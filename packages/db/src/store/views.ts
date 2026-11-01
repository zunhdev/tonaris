// The store's personal choices (TS-16; FR-05.2, FR-11.7, FR-11.8): view choices, account defaults, and manual order,
// with what a view holds now for a move to be placed in.

import { and, eq, inArray, isNull, not, sql } from "drizzle-orm";

import type { CollectionStore } from "@tonaris/domain";

import type { Executor, Transaction } from "../client";
import { accountDefaultsColumns, inActiveList, viewPrefsColumns } from "../columns";
import { accountSettings, albums, containers, memberships, positions, viewPrefs } from "../schema";

/** The person's choices for the view, if they made any (FR-11.7). */
export async function findViewPrefsIn(db: Executor, personId: string, viewKey: string) {
  const [row] = await db
    .select(viewPrefsColumns)
    .from(viewPrefs)
    .where(and(eq(viewPrefs.personId, personId), eq(viewPrefs.viewKey, viewKey)));
  return row;
}

/** View choices, defaults and manual order, on `tx`. */
export function viewStore(tx: Transaction) {
  return {
    findViewPrefs: (personId, viewKey) => findViewPrefsIn(tx, personId, viewKey),
    async saveViewPrefs(personId, { viewKey, ...choices }) {
      await tx
        .insert(viewPrefs)
        .values({ personId, viewKey, ...choices })
        .onConflictDoUpdate({ target: [viewPrefs.personId, viewPrefs.viewKey], set: choices });
    },
    async deleteViewPrefs(personId, viewKey) {
      await tx
        .delete(viewPrefs)
        .where(and(eq(viewPrefs.personId, personId), eq(viewPrefs.viewKey, viewKey)));
    },
    async findDefaults(personId) {
      const [row] = await tx
        .select(accountDefaultsColumns)
        .from(accountSettings)
        .where(eq(accountSettings.accountId, personId));
      return row;
    },
    async saveDefaults(personId, defaults) {
      await tx
        .insert(accountSettings)
        .values({ accountId: personId, ...defaults })
        .onConflictDoUpdate({ target: accountSettings.accountId, set: defaults });
    },

    async findPositions(personId, viewKey, itemIds) {
      if (itemIds.length === 0) return new Map();
      const rows = await tx
        .select({ itemId: positions.itemId, key: positions.key })
        .from(positions)
        .where(
          and(
            eq(positions.personId, personId),
            eq(positions.viewKey, viewKey),
            inArray(positions.itemId, [...itemIds]),
          ),
        );
      return new Map(rows.map((row) => [row.itemId, row.key]));
    },
    async savePosition(personId, { viewKey, itemId, key }) {
      await tx
        .insert(positions)
        .values({ personId, viewKey, itemId, key })
        .onConflictDoUpdate({
          target: [positions.personId, positions.viewKey, positions.itemId],
          set: { key },
        });
    },
    async deletePosition(personId, viewKey, itemId) {
      const deleted = await tx
        .delete(positions)
        .where(
          and(
            eq(positions.personId, personId),
            eq(positions.viewKey, viewKey),
            eq(positions.itemId, itemId),
          ),
        )
        .returning({ itemId: positions.itemId });
      return deleted.length > 0;
    },
    async firstKey(personId, viewKey) {
      // Keys compare bytewise, never by the database's locale (TS-16).
      const [row] = await tx
        .select({ key: positions.key })
        .from(positions)
        .where(and(eq(positions.personId, personId), eq(positions.viewKey, viewKey)))
        .orderBy(sql`${positions.key} collate "C"`)
        .limit(1);
      return row?.key;
    },
    async viewItems(personId, viewKey, kind) {
      let rows: { id: string }[];
      if (kind === "containers") {
        rows = await tx
          .select({ id: containers.id })
          .from(containers)
          .where(
            and(
              // The root is the person's; a folder's children are its owner's, who may be someone sharing it.
              viewKey === "root"
                ? and(eq(containers.ownerId, personId), isNull(containers.parentId))
                : eq(containers.parentId, viewKey),
              isNull(containers.trashedAt),
            ),
          );
      } else if (viewKey === "unsorted") {
        rows = await tx
          .select({ id: albums.id })
          .from(albums)
          .where(
            and(
              eq(albums.ownerId, personId),
              isNull(albums.trashedAt),
              not(inActiveList(tx, albums.id)),
            ),
          );
      } else {
        rows = await tx
          .select({ id: memberships.albumId })
          .from(memberships)
          .innerJoin(albums, eq(albums.id, memberships.albumId))
          .where(and(eq(memberships.listId, viewKey), isNull(albums.trashedAt)));
      }
      return new Set(rows.map((row) => row.id));
    },
    async inActiveList(albumId) {
      const [row] = await tx.execute<{ listed: boolean }>(
        sql`select ${inActiveList(tx, albumId)} as listed`,
      );
      return row?.listed === true;
    },
  } satisfies Partial<CollectionStore>;
}
