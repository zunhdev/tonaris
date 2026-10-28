// The account's custom fields (FR-03.6, TS-24): a collection over the snapshot and the stream, one row per field with
// its options in order. Defining a field is `field.create`, with the IDs the client chose (TS-10); renaming it is
// `field.rename` with the name the client last saw (TS-21). An update's type becomes `field.changeType`, and its
// options the ones removed, renamed and added, in that order, so a label a removal frees can be reused (TON-51). A
// chosen option's removal carries the hash its confirmation showed, as `metadata.confirmed[optionId]` (TS-14).
// Deleting a field is `field.delete`, always with its confirmed hash, as `metadata.confirmed[fieldId]` (FR-03.18).

import { uuidv7, type CustomField, type Mutation } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

/**
 * An update's or delete's metadata: confirmed scope hashes (TS-14), by the ID of each option removed (FR-03.17) or
 * field deleted (FR-03.18).
 */
export type FieldWriteMetadata = { confirmed?: Record<string, string> };

const confirmedOf = (metadata: unknown): Record<string, string> => {
  if (typeof metadata !== "object" || metadata === null || !("confirmed" in metadata)) return {};
  const { confirmed } = metadata;
  if (typeof confirmed !== "object" || confirmed === null) return {};
  return Object.fromEntries(
    Object.entries(confirmed).flatMap(([id, hash]) =>
      typeof hash === "string" ? [[id, hash]] : [],
    ),
  );
};

/** The writes that turn `original` into `modified`. */
export function fieldWrites(
  original: CustomField,
  modified: CustomField,
  metadata?: unknown,
): Mutation[] {
  const { id } = original;
  const writes: Mutation[] = [];
  if (modified.name !== original.name) {
    writes.push({
      mutationId: uuidv7(),
      name: "field.rename",
      args: { id, name: modified.name },
      base: { name: original.name },
    });
  }
  if (modified.type !== original.type) {
    writes.push({
      mutationId: uuidv7(),
      name: "field.changeType",
      args: { id, type: modified.type },
      base: { type: original.type },
    });
  }
  const confirmed = confirmedOf(metadata);
  const before = new Map(original.options.map((option) => [option.id, option]));
  const after = new Set(modified.options.map((option) => option.id));
  for (const option of original.options) {
    if (after.has(option.id)) continue;
    const scopeHash = confirmed[option.id];
    writes.push({
      mutationId: uuidv7(),
      name: "field.removeOption",
      args: { fieldId: id, optionId: option.id, ...(scopeHash === undefined ? {} : { scopeHash }) },
    });
  }
  for (const option of modified.options) {
    const was = before.get(option.id);
    if (was && was.label !== option.label) {
      writes.push({
        mutationId: uuidv7(),
        name: "field.renameOption",
        args: { fieldId: id, optionId: option.id, label: option.label },
        base: { label: was.label },
      });
    }
  }
  for (const option of modified.options) {
    if (before.has(option.id)) continue;
    writes.push({
      mutationId: uuidv7(),
      name: "field.addOption",
      args: { fieldId: id, id: option.id, label: option.label },
    });
  }
  return writes;
}

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
          transaction.mutations.flatMap((pending) =>
            fieldWrites(pending.original, pending.modified, pending.metadata).map((mutation) => ({
              key: pending.key,
              mutation,
            })),
          ),
        ),
      onDelete: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.map((pending) => {
            const mutation: Mutation = {
              mutationId: uuidv7(),
              name: "field.delete",
              args: {
                id: pending.original.id,
                scopeHash: confirmedOf(pending.metadata)[pending.original.id] ?? "",
              },
            };
            return { key: pending.key, mutation };
          }),
        ),
    },
  );
}

export type FieldCollection = ReturnType<typeof createFieldCollection>;
