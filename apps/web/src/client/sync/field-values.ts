// The fields albums apply, with their values (FR-03.7, TS-24): a collection over the snapshot and the stream, one row
// per album and field. A row is an applied field, and a null value is applied-empty. Applying a field is
// `fieldValue.apply`, followed in the same request by `fieldValue.set` when it starts with a value; changing a value
// is `fieldValue.set` over the value the client last saw (TS-21); removing the field is `fieldValue.remove` (FR-03.8).

import { fieldValueKey, uuidv7, type FieldValue, type Mutation } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

const keyOf = (row: FieldValue) => fieldValueKey(row.albumId, row.fieldId);

export function createFieldValueCollection({
  engine,
  writer,
}: {
  engine: SyncEngine;
  writer: Writer;
}) {
  return snapshotCollection<FieldValue>(
    engine,
    "fieldValues",
    (snapshot) => snapshot.fieldValues,
    keyOf,
    (change) => (change.entity === "fieldValue" ? { key: change.id, row: change.data } : undefined),
    {
      onInsert: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.flatMap((pending) => {
            const { albumId, fieldId, value } = pending.modified;
            const apply: Mutation = {
              mutationId: uuidv7(),
              name: "fieldValue.apply",
              args: { albumId, fieldId },
            };
            const set: Mutation = {
              mutationId: uuidv7(),
              name: "fieldValue.set",
              args: { albumId, fieldId, value },
              base: { value: null },
            };
            return [
              { key: pending.key, mutation: apply },
              ...(value === null ? [] : [{ key: pending.key, mutation: set }]),
            ];
          }),
        ),
      onUpdate: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => {
            const { albumId, fieldId, value } = pending.modified;
            const mutation: Mutation = {
              mutationId: uuidv7(),
              name: "fieldValue.set",
              args: { albumId, fieldId, value },
              base: { value: pending.original.value },
            };
            return { key: pending.key, mutation };
          }),
        ),
      onDelete: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => {
            const { albumId, fieldId } = pending.original;
            const mutation: Mutation = {
              mutationId: uuidv7(),
              name: "fieldValue.remove",
              args: { albumId, fieldId },
            };
            return { key: pending.key, mutation };
          }),
        ),
    },
  );
}

export type FieldValueCollection = ReturnType<typeof createFieldValueCollection>;
