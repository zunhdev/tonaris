// The account's custom fields (FR-03.6, TS-24): a collection over the snapshot and the stream, one row per field with
// its options in order. Defining a field is `field.create`, with the IDs the client chose (TS-10); renaming it is
// `field.rename` with the name the client last saw (TS-21). Option and type changes come with TON-51.

import { uuidv7, type CustomField, type Mutation } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

export function createFieldCollection({ engine, writer }: { engine: SyncEngine; writer: Writer }) {
  return snapshotCollection<CustomField>(
    engine,
    "fields",
    (snapshot) => snapshot.fields,
    (field) => field.id,
    (change) => (change.entity === "field" ? { key: change.id, row: change.data } : undefined),
    {
      onInsert: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => {
            const { id, name, type, options } = pending.modified;
            const mutation: Mutation = {
              mutationId: uuidv7(),
              name: "field.create",
              args: {
                id,
                name,
                type,
                options: options.map(({ id: optionId, label }) => ({ id: optionId, label })),
              },
            };
            return { key: pending.key, mutation };
          }),
        ),
      onUpdate: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.flatMap((pending) => {
            const { original, changes } = pending;
            if (changes.name === undefined || changes.name === original.name) return [];
            const mutation: Mutation = {
              mutationId: uuidv7(),
              name: "field.rename",
              args: { id: original.id, name: changes.name },
              base: { name: original.name },
            };
            return [{ key: pending.key, mutation }];
          }),
        ),
    },
  );
}

export type FieldCollection = ReturnType<typeof createFieldCollection>;
