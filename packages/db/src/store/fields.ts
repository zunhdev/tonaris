// The store's custom fields (TS-11, TS-14; FR-03.6–FR-03.18): definitions with their name keys, options in order,
// and the values albums apply, through the codec in field-values.ts.

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { fieldValueKey, nameKey, type CollectionStore } from "@tonaris/domain";

import type { Transaction } from "../client";
import {
  columnsOf,
  emptyValue,
  fieldsOfAccount,
  fieldUsersIn,
  findFieldIn,
  optionUsersIn,
  selectedBy,
  selectionsOf,
  valueColumns,
  valueOf,
} from "../field-values";
import {
  albumFieldMulti,
  albumFieldValues,
  albums,
  fieldDefinitions,
  fieldOptions,
} from "../schema";

/** Custom fields, their options and the values albums apply, on `tx`. */
export function fieldStore(tx: Transaction) {
  return {
    findField: (id) => findFieldIn(tx, id),
    fieldsOf: (ownerId) => fieldsOfAccount(tx, ownerId),
    async insertField({ id, ownerId, name, type }, options) {
      await tx.insert(fieldDefinitions).values({ id, ownerId, name, nameKey: nameKey(name), type });
      if (options.length > 0) {
        await tx.insert(fieldOptions).values(
          options.map((option) => ({
            id: option.id,
            fieldId: id,
            label: option.label,
            labelKey: nameKey(option.label),
            sortKey: option.sortKey,
          })),
        );
      }
    },
    async renameField(id, name) {
      await tx
        .update(fieldDefinitions)
        .set({ name, nameKey: nameKey(name) })
        .where(eq(fieldDefinitions.id, id));
    },

    async findFieldValue(albumId, fieldId) {
      const [row] = await tx
        .select({ ...valueColumns, type: fieldDefinitions.type })
        .from(albumFieldValues)
        .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, albumFieldValues.fieldId))
        .where(and(eq(albumFieldValues.albumId, albumId), eq(albumFieldValues.fieldId, fieldId)));
      if (!row) return undefined;
      const selected =
        row.type === "multiple_choice"
          ? await selectionsOf(tx, eq(albumFieldMulti.albumId, albumId), fieldId)
          : [];
      return valueOf(
        row,
        selected.map((each) => each.optionId),
      );
    },
    async applyField(albumId, fieldId) {
      await tx.insert(albumFieldValues).values({ albumId, fieldId }).onConflictDoNothing();
    },
    async setFieldValue(albumId, field, value) {
      const at = and(eq(albumFieldValues.albumId, albumId), eq(albumFieldValues.fieldId, field.id));
      await tx
        .update(albumFieldValues)
        .set({ ...emptyValue, ...columnsOf(field.type, value) })
        .where(at);
      if (field.type !== "multiple_choice") return;
      await tx
        .delete(albumFieldMulti)
        .where(and(eq(albumFieldMulti.albumId, albumId), eq(albumFieldMulti.fieldId, field.id)));
      if (Array.isArray(value) && value.length > 0) {
        await tx
          .insert(albumFieldMulti)
          .values(value.map((optionId) => ({ albumId, fieldId: field.id, optionId })));
      }
    },
    async removeField(albumId, fieldId) {
      // Its multiple-choice selections cascade (TS-11).
      await tx
        .delete(albumFieldValues)
        .where(and(eq(albumFieldValues.albumId, albumId), eq(albumFieldValues.fieldId, fieldId)));
    },
    async fieldUsage(fieldId) {
      // An album in Trash keeps its rows (TS-13), so it counts (TS-14).
      const rows = await tx
        .select({ trashed: sql<boolean>`${albums.trashedAt} is not null`, n: count() })
        .from(albumFieldValues)
        .innerJoin(albums, eq(albums.id, albumFieldValues.albumId))
        .where(eq(albumFieldValues.fieldId, fieldId))
        .groupBy(sql`1`);
      return {
        active: rows.find((row) => !row.trashed)?.n ?? 0,
        trashed: rows.find((row) => row.trashed)?.n ?? 0,
      };
    },
    optionUsers: (fieldId, optionId) => optionUsersIn(tx, fieldId, optionId),
    fieldUsers: (fieldId) => fieldUsersIn(tx, fieldId),
    async deleteField(fieldId) {
      // Its options, and every album's usage and selections, cascade (TS-11), in Trash too (TS-13).
      await tx.delete(fieldDefinitions).where(eq(fieldDefinitions.id, fieldId));
    },
    async optionField(optionId) {
      const [row] = await tx
        .select({ fieldId: fieldOptions.fieldId })
        .from(fieldOptions)
        .where(eq(fieldOptions.id, optionId));
      return row?.fieldId;
    },
    async lastOptionKey(fieldId) {
      const [row] = await tx
        .select({ sortKey: fieldOptions.sortKey })
        .from(fieldOptions)
        .where(eq(fieldOptions.fieldId, fieldId))
        .orderBy(sql`${fieldOptions.sortKey} collate "C" desc`)
        .limit(1);
      return row?.sortKey ?? null;
    },
    async changeFieldType(fieldId, type, discardOptions) {
      await tx.update(fieldDefinitions).set({ type }).where(eq(fieldDefinitions.id, fieldId));
      if (discardOptions) await tx.delete(fieldOptions).where(eq(fieldOptions.fieldId, fieldId));
    },
    async insertFieldOption(fieldId, { id, label, sortKey }) {
      await tx
        .insert(fieldOptions)
        .values({ id, fieldId, label, labelKey: nameKey(label), sortKey });
    },
    async renameFieldOption(optionId, label) {
      await tx
        .update(fieldOptions)
        .set({ label, labelKey: nameKey(label) })
        .where(eq(fieldOptions.id, optionId));
    },
    async removeFieldOption(fieldId, optionId, albumIds) {
      // The foreign keys clear it: a single choice's `option_id` becomes null, and a multiple choice's selection
      // goes, its row staying applied (TS-11, FR-03.17).
      await tx.delete(fieldOptions).where(eq(fieldOptions.id, optionId));
      if (albumIds.length === 0) return [];
      const where = and(
        inArray(albumFieldValues.albumId, albumIds),
        eq(albumFieldValues.fieldId, fieldId),
      );
      const rows = await tx
        .select({ ...valueColumns, type: fieldDefinitions.type })
        .from(albumFieldValues)
        .innerJoin(fieldDefinitions, eq(fieldDefinitions.id, albumFieldValues.fieldId))
        .where(where)
        .orderBy(asc(albumFieldValues.albumId));
      const selected = selectedBy(
        await selectionsOf(tx, inArray(albumFieldMulti.albumId, albumIds), fieldId),
      );
      return rows.map((row) => ({
        albumId: row.albumId,
        fieldId,
        value: valueOf(row, selected.get(fieldValueKey(row.albumId, fieldId)) ?? []),
      }));
    },
  } satisfies Partial<CollectionStore>;
}
