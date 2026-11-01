// The fields albums apply, with their values (FR-03.7, TS-24): a collection over the snapshot and the stream, one row
// per album and field. A row is an applied field, and a null value is applied-empty. Applying a field is
// `fieldValue.apply`, followed in the same request by `fieldValue.set` when it starts with a value; changing a value
// is `fieldValue.set` over the value the client last saw (TS-21); removing the field is `fieldValue.remove` (FR-03.8).

import { fieldValueKey, type FieldValue } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";
import { envelope } from "./writes";

const keyOf = (row: FieldValue) => fieldValueKey(row.albumId, row.fieldId);

export function createFieldValueCollection({
  engine,
  writer,
}: {
  engine: SyncEngine;
  writer: Writer;
}) {
  return snapshotCollection({
    engine,
    id: "fieldValues",
    entity: "fieldValue",
    rows: (snapshot) => snapshot.fieldValues,
    getKey: keyOf,
    handlers: {
      onInsert: ({ transaction }) =>
        writer.persistEach(transaction, ({ modified: { albumId, fieldId, value } }) => [
          envelope("fieldValue.apply", { albumId, fieldId }),
          ...(value === null
            ? []
            : [envelope("fieldValue.set", { albumId, fieldId, value }, { value: null })]),
        ]),
      onUpdate: ({ transaction }) =>
        writer.persistEach(transaction, ({ original, modified: { albumId, fieldId, value } }) => [
          envelope("fieldValue.set", { albumId, fieldId, value }, { value: original.value }),
        ]),
      onDelete: ({ transaction }) =>
        writer.persistEach(transaction, ({ original: { albumId, fieldId } }) => [
          envelope("fieldValue.remove", { albumId, fieldId }),
        ]),
    },
  });
}

export type FieldValueCollection = ReturnType<typeof createFieldValueCollection>;
