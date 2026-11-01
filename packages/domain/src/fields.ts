// Custom fields as clients hold them (TS-11, TS-24), and the commands that define and rename them (TON-49). A field
// is defined once per account (FR-03.6): text, number, date, yes/no, or a choice field with its options. Names are
// unique per account across types, and option labels within their field, case-insensitively (FR-03.9, FR-03.14,
// X-06). Renaming changes the one definition everywhere, albums in Trash included, and nothing else (FR-03.11,
// X-09). Per-album values, option changes, type changes and deletion come with TON-50 to TON-52.

import { generateNKeysBetween } from "fractional-indexing";

import { actingOwner, applied, conflict, isFailure } from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import { maxFieldOptions, maxFields, maxNameLength } from "./limits";
import { findNameConflict, isBlankName } from "./names";
import { failure, type Failure } from "./outcomes";
import { authorizeWrite } from "./policies";
import { z } from "./zod";

/** The types a field has (FR-03.6). */
export const fieldTypes = [
  "text",
  "number",
  "date",
  "yes_no",
  "single_choice",
  "multiple_choice",
] as const;
export type FieldType = (typeof fieldTypes)[number];

/** The types whose fields have options (FR-03.6, FR-03.13). */
export const choiceTypes: readonly FieldType[] = ["single_choice", "multiple_choice"];
export const isChoiceType = (type: FieldType) => choiceTypes.includes(type);

export const fieldOptionSchema = z.object({ id: z.uuid(), label: z.string() });
export type FieldOption = z.infer<typeof fieldOptionSchema>;

/** A custom field, with its options in their order (FR-03.6). */
export const customFieldSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: z.enum(fieldTypes),
    options: z.array(fieldOptionSchema).meta({
      description: "A choice field's options, in their order; empty for any other type.",
    }),
  })
  .meta({ description: "An account-level custom field (FR-03.6)." });
export type CustomField = z.infer<typeof customFieldSchema>;

/** A field as the store keeps it: with its owner. */
export type StoredField = CustomField & { ownerId: string };

/** `field.create`'s arguments: IDs the client chose (TS-10). */
export const fieldCreateArgsSchema = z.object({
  id: z.uuid({ version: "v7" }),
  name: z.string(),
  type: z.enum(fieldTypes),
  options: z.array(z.object({ id: z.uuid({ version: "v7" }), label: z.string() })),
});
export type FieldCreateArgs = z.infer<typeof fieldCreateArgsSchema>;

/** Code points rather than graphemes: the limit bounds stored text (TS-18). */
// oxlint-disable-next-line no-misused-spread
const tooLong = (text: string) => [...text].length > maxNameLength;

/** Why `name`, already trimmed, can't name a field, if it can't (X-06, TS-18). Clients check it too. */
export function fieldNameProblem(name: string): Failure | undefined {
  if (isBlankName(name)) {
    return failure("validation_failed", "Give the field a name.", [
      { path: "args.name", message: "Required" },
    ]);
  }
  if (tooLong(name)) {
    return failure("validation_failed", `Names can be at most ${maxNameLength} characters.`, [
      { path: "args.name", message: `At most ${maxNameLength} characters` },
    ]);
  }
  return undefined;
}

/** Why `label`, already trimmed, can't label an option, if it can't (FR-03.10, TS-18). */
export function optionLabelProblem(label: string, path: string): Failure | undefined {
  if (isBlankName(label)) {
    return failure("validation_failed", "Give each option a label.", [
      { path, message: "Required" },
    ]);
  }
  if (tooLong(label)) {
    return failure("validation_failed", `Labels can be at most ${maxNameLength} characters.`, [
      { path, message: `At most ${maxNameLength} characters` },
    ]);
  }
  return undefined;
}

/** The refusal of a name another field of the account has (FR-03.9). Clients check it too, with these words. */
export function fieldNameTaken(takenName: string): Failure {
  return failure("name_conflict", `'${takenName}' already exists. Choose another name.`, [
    { path: "args.name", message: "Already used" },
  ]);
}

/** The field as clients see it. */
export const fieldOf = ({ id, name, type, options }: CustomField): CustomField => ({
  id,
  name,
  type,
  options: options.map(({ id: optionId, label }) => ({ id: optionId, label })),
});

const fieldMissing = () => failure("not_found", "This field doesn't exist.");

/**
 * `field`, as the store found it, if the principal may change it, or why not: a missing field is `not_found`, and
 * someone else's gets the policy's code (TS-30). With `denial: "not_found"`, someone else's is answered as missing.
 */
export function ownField(
  field: StoredField | undefined,
  { principal }: CommandContext,
  { denial }: { denial?: "not_found" } = {},
): StoredField | Failure {
  if (!field) return fieldMissing();
  const decision = authorizeWrite(principal, { ownerId: field.ownerId, scope: "collection" });
  if (decision.allowed) return field;
  return denial === "not_found"
    ? fieldMissing()
    : failure(decision.code, "You can't change this field.");
}

/** The options a new field starts with, trimmed and checked; or why they can't be. */
function initialOptions(args: FieldCreateArgs): FieldOption[] | Failure {
  if (args.options.length > 0 && !isChoiceType(args.type)) {
    return failure("validation_failed", "Only choice fields have options.", [
      { path: "args.options", message: "Only for single and multiple choice" },
    ]);
  }
  if (args.options.length > maxFieldOptions) {
    return failure("limit_exceeded", `A choice field can have at most ${maxFieldOptions} options.`);
  }
  const options: FieldOption[] = [];
  for (const [index, option] of args.options.entries()) {
    const label = option.label.trim();
    const problem = optionLabelProblem(label, `args.options.${index}.label`);
    if (problem) return problem;
    if (
      findNameConflict(
        label,
        options.map(({ id, label: taken }) => ({ id, name: taken })),
      )
    ) {
      return failure("validation_failed", "Each option needs its own label.", [
        { path: `args.options.${index}.label`, message: "Already used in this field" },
      ]);
    }
    options.push({ id: option.id, label });
  }
  return options;
}

/** Whether two fields are the same definition: name, type and options, in order. */
const sameField = (a: CustomField, b: CustomField) =>
  a.name === b.name &&
  a.type === b.type &&
  a.options.length === b.options.length &&
  a.options.every((option, index) => {
    const other = b.options[index];
    return other?.id === option.id && other.label === option.label;
  });

/**
 * `field.create` (FR-03.6): defines a field with the client's IDs (TS-10), applied to no album. A create sent again
 * without its idempotency record duplicates nothing (FR-13.5): the same definition is already saved, and a different
 * one is a conflict.
 */
export async function createField(
  args: FieldCreateArgs,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = actingOwner(context, "collection", "You can't change custom fields here.");
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  const name = args.name.trim();
  const problem = fieldNameProblem(name);
  if (problem) return problem;
  const options = initialOptions(args);
  if (isFailure(options)) return options;
  const field: CustomField = { id: args.id, name, type: args.type, options };

  const existing = await store.findField(args.id);
  if (existing) {
    if (existing.ownerId !== ownerId) {
      return failure("validation_failed", "This field ID is already in use.", [
        { path: "args.id", message: "Already in use" },
      ]);
    }
    return sameField(existing, field) ? applied() : conflict("name", existing.name, field.name);
  }

  const fields = await store.fieldsOf(ownerId);
  const taken = findNameConflict(name, fields);
  if (taken) return fieldNameTaken(taken.name);
  if (fields.length >= maxFields) {
    return failure(
      "limit_exceeded",
      `You've reached ${maxFields} custom fields. Delete one to add another.`,
    );
  }

  const keys = generateNKeysBetween(null, null, options.length);
  await store.insertField(
    { ...field, ownerId },
    options.map((option, index) => ({
      id: option.id,
      label: option.label,
      sortKey: keys[index] ?? "",
    })),
  );
  return applied({ entity: "field", id: field.id, op: "insert", data: fieldOf(field) });
}

/**
 * `field.rename` (FR-03.11, X-09): renames the one definition everywhere, if it is still `base.name` (TS-21). Its
 * type, options, usage and values stay; a case-only rename keeps the new spelling.
 */
export async function renameField(
  args: { id: string; name: string },
  base: { name: string },
  context: CommandContext,
): Promise<CommandResult> {
  const { store } = context;
  const field = ownField(await store.findField(args.id), context);
  if (isFailure(field)) return field;
  const name = args.name.trim();
  if (field.name !== base.name) return conflict("name", field.name, name, base.name);
  const problem = fieldNameProblem(name);
  if (problem) return problem;
  if (name === field.name) return applied();
  const taken = findNameConflict(name, await store.fieldsOf(field.ownerId), field.id);
  if (taken) return fieldNameTaken(taken.name);

  await store.renameField(field.id, name);
  return applied({
    entity: "field",
    id: field.id,
    op: "update",
    data: fieldOf({ ...field, name }),
  });
}
