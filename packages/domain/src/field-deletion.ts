// Deleting a custom field permanently (TON-52; FR-03.18, X-07, X-09, TS-14). Deletion is always confirmed, even for
// a field no album uses: the server computes its scope, the definition with its options and the albums applying it,
// active and in Trash, and deletes it only with that scope's hash, as it is when deleting. It removes every album's
// usage and value at once, Trash included, so recovering an album never brings the field back.

import { scopeHash } from "./approvals";
import { applied, isFailure } from "./command-kit";
import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import type { OptionUser } from "./field-options";
import { fieldValueKey } from "./field-values";
import { fieldTypes, ownField, type CustomField, type FieldOption } from "./fields";
import { byBytes } from "./order";
import { failure } from "./outcomes";
import { z } from "./zod";

export const fieldDeleteArgsSchema = z.object({
  id: z.uuid(),
  scopeHash: z.string().meta({
    description:
      "The hash of the deletion's scope, as `GET /v1/fields/{fieldId}/deletion` gave it. Deletion is always confirmed (FR-03.18, TS-14).",
  }),
});

/** What deleting a field affects (FR-03.18): its definition and options, and its albums by ID, in Trash or not. */
export type FieldDeletionScope = {
  operation: "delete_field";
  fieldId: string;
  name: string;
  type: CustomField["type"];
  options: FieldOption[];
  albums: OptionUser[];
};

/** The scope of deleting `field`, in a canonical order so the same deletion always hashes the same. */
export function fieldDeletionScope(
  field: CustomField,
  users: readonly OptionUser[],
): FieldDeletionScope {
  return {
    operation: "delete_field",
    fieldId: field.id,
    name: field.name,
    type: field.type,
    options: field.options.map(({ id, label }) => ({ id, label })),
    albums: users
      .map(({ id, trashed }) => ({ id, trashed }))
      .toSorted((a, b) => byBytes(a.id, b.id)),
  };
}

/** What the confirmation shows (DS-60): the definition, its options, and the albums applying it, with the hash. */
export const fieldDeletionSchema = z
  .object({
    field: z.object({ id: z.uuid(), name: z.string(), type: z.enum(fieldTypes) }),
    options: z.array(z.object({ id: z.uuid(), label: z.string() })),
    albums: z.int().nonnegative().meta({ description: "Active albums applying the field." }),
    inTrash: z.int().nonnegative().meta({ description: "Albums in Trash applying the field." }),
    scopeHash: z.string().meta({
      description:
        "Confirms exactly this scope: pass it to `field.delete`. The deletion is refused if the field or the albums applying it changed meanwhile.",
    }),
  })
  .meta({ description: "What deleting a field affects (FR-03.18, TS-14)." });
export type FieldDeletion = z.infer<typeof fieldDeletionSchema>;

/** The confirmation's view of the scope. */
export async function fieldDeletion(
  field: CustomField,
  users: readonly OptionUser[],
): Promise<FieldDeletion> {
  const trashed = users.filter((user) => user.trashed).length;
  return {
    field: { id: field.id, name: field.name, type: field.type },
    options: field.options.map(({ id, label }) => ({ id, label })),
    albums: users.length - trashed,
    inTrash: trashed,
    scopeHash: await scopeHash(fieldDeletionScope(field, users)),
  };
}

/**
 * `field.delete` (FR-03.18): deletes the field with its options and every album's usage and value, Trash included,
 * only with the hash of its scope as computed here, under the lock. Already gone, it changes nothing.
 */
export async function deleteField(
  args: z.infer<typeof fieldDeleteArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const { store } = context;
  const stored = await store.findField(args.id);
  if (!stored) return applied();
  // Someone else's field is answered as missing, whatever the policy's reason.
  const field = ownField(stored, context, { denial: "not_found" });
  if (isFailure(field)) return field;
  const users = await store.fieldUsers(field.id);
  if (args.scopeHash !== (await scopeHash(fieldDeletionScope(field, users)))) {
    return failure(
      "field_in_use",
      `'${field.name}' changed since you confirmed. Review the deletion and confirm again.`,
    );
  }

  await store.deleteField(field.id);
  return applied(
    { entity: "field", id: field.id, op: "delete", data: null },
    ...users.map((user): ChangeInput => ({
      entity: "fieldValue",
      id: fieldValueKey(user.id, field.id),
      op: "delete",
      data: null,
    })),
  );
}
