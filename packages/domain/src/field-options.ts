// A field's type and options after it is defined (TON-51; FR-03.12 to FR-03.17, X-09, TS-14). A type changes only
// while no album uses the field, in Trash or not, even empty; options stay between the two choice types and are
// discarded otherwise, never restored. Options are added at the end and renamed in place, keeping every selection,
// with labels unique per field (X-06). Removing an option no album chooses is ordinary; removing a chosen one is
// confirmed (X-07): the server computes its scope, the albums choosing it, and removes it only with that scope's hash,
// as it is when removing. Removal clears the option everywhere, Trash included, so recovery brings nothing back.

import { generateKeyBetween } from "fractional-indexing";

import { scopeHash } from "./approvals";
import { applied, conflict, isFailure } from "./command-kit";
import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import { fieldValueKey } from "./field-values";
import {
  fieldOf,
  fieldTypes,
  isChoiceType,
  optionLabelConflict,
  optionLabelProblem,
  optionLimitProblem,
  ownField,
  type CustomField,
  type FieldOption,
  type FieldType,
  type StoredField,
} from "./fields";
import { maxFieldOptions } from "./limits";
import { byBytes } from "./order";
import { failure, type Failure } from "./outcomes";
import { z } from "./zod";

/** `field.changeType`'s `result` in a `confirmed` outcome: the options a change to a non-choice type discarded. */
const fieldTypeChangeResultSchema = z
  .object({ discardedOptions: z.array(z.object({ id: z.uuid(), label: z.string() })) })
  .meta({
    description: "The options a type change discarded (FR-03.13); empty when it kept them.",
  });
export type FieldTypeChangeResult = z.infer<typeof fieldTypeChangeResultSchema>;

export const fieldChangeTypeArgsSchema = z.object({ id: z.uuid(), type: z.enum(fieldTypes) });
export const fieldAddOptionArgsSchema = z.object({
  fieldId: z.uuid(),
  id: z.uuid({ version: "v7" }),
  label: z.string(),
});
export const fieldRenameOptionArgsSchema = z.object({
  fieldId: z.uuid(),
  optionId: z.uuid(),
  label: z.string(),
});
export const fieldRemoveOptionArgsSchema = z.object({
  fieldId: z.uuid(),
  optionId: z.uuid(),
  scopeHash: z.string().optional().meta({
    description:
      "The hash of the removal's scope, as `GET /v1/fields/{fieldId}/options/{optionId}/removal` gave it: required when any album chooses the option (FR-03.17, TS-14).",
  }),
});

/** The albums that apply a field, active and in Trash (FR-03.12). */
export type FieldUsage = { active: number; trashed: number };

/** Every field's usage, for Settings (DS-60): albums applying it, active and in Trash, even empty. */
export const fieldUsageListSchema = z
  .object({
    fields: z.array(
      z.object({
        fieldId: z.uuid(),
        albums: z.int().nonnegative().meta({ description: "Active albums applying the field." }),
        inTrash: z.int().nonnegative().meta({ description: "Albums in Trash applying the field." }),
      }),
    ),
  })
  .meta({ description: "How many albums apply each of the account's fields (FR-03.12, DS-60)." });
export type FieldUsageList = z.infer<typeof fieldUsageListSchema>;

/** An album choosing an option, and whether it is in Trash. */
export type OptionUser = { id: string; trashed: boolean };

/** What removing an option affects (FR-03.17): its albums by ID, in Trash or not. Shared views join with M7. */
export type OptionRemovalScope = {
  operation: "remove_option";
  fieldId: string;
  optionId: string;
  albums: OptionUser[];
};

/** The scope of removing the option, in a canonical order so the same removal always hashes the same. */
export function optionRemovalScope(
  fieldId: string,
  optionId: string,
  users: readonly OptionUser[],
): OptionRemovalScope {
  return {
    operation: "remove_option",
    fieldId,
    optionId,
    albums: users
      .map(({ id, trashed }) => ({ id, trashed }))
      .toSorted((a, b) => byBytes(a.id, b.id)),
  };
}

/** `sha256(canonical(scope))` in hex (TS-14, TS-64). */
export const optionRemovalHash = (scope: OptionRemovalScope): Promise<string> => scopeHash(scope);

/** What the confirmation shows (DS-60): the field, the option, and the albums choosing it, with the scope's hash. */
export const optionRemovalSchema = z
  .object({
    field: z.object({ id: z.uuid(), name: z.string() }),
    option: z.object({ id: z.uuid(), label: z.string() }),
    albums: z.int().nonnegative().meta({ description: "Active albums choosing the option." }),
    inTrash: z.int().nonnegative().meta({ description: "Albums in Trash choosing the option." }),
    scopeHash: z.string().meta({
      description:
        "Confirms exactly this scope: pass it to `field.removeOption`. The removal is refused if the albums choosing the option changed meanwhile.",
    }),
  })
  .meta({ description: "What removing an option affects (FR-03.17, TS-14)." });
export type OptionRemoval = z.infer<typeof optionRemovalSchema>;

/** The confirmation's view of the scope. */
export async function optionRemoval(
  field: CustomField,
  option: FieldOption,
  users: readonly OptionUser[],
): Promise<OptionRemoval> {
  const trashed = users.filter((user) => user.trashed).length;
  return {
    field: { id: field.id, name: field.name },
    option: { id: option.id, label: option.label },
    albums: users.length - trashed,
    inTrash: trashed,
    scopeHash: await optionRemovalHash(optionRemovalScope(field.id, option.id, users)),
  };
}

const albums = (n: number) => `${n} ${n === 1 ? "album" : "albums"}`;

/** "3 albums (1 in Trash)": how many use something, Trash named when it counts (X-09). */
export function usageText({ active, trashed }: FieldUsage): string {
  const total = albums(active + trashed);
  return trashed === 0 ? total : `${total} (${trashed} in Trash)`;
}

/** The refusal of a type change for a used field (FR-03.12, DS-60), with these words in the app too. */
export function fieldTypeInUse(usage: FieldUsage): Failure {
  return failure(
    "field_in_use",
    `Used by ${usageText(usage)}. Create a new field of the type you need instead.`,
  );
}

/** The refusal of a label another option of the field has (FR-03.14). Clients check it too, with these words. */
export function optionLabelTaken(takenLabel: string): Failure {
  return failure("name_conflict", `'${takenLabel}' already exists. Choose another label.`, [
    { path: "args.label", message: "Already used in this field" },
  ]);
}

const fieldChange = (field: CustomField): ChangeInput => ({
  entity: "field",
  id: field.id,
  op: "update",
  data: fieldOf(field),
});

/** A choice field, or why options can't change on it. */
function choiceField(field: StoredField): Failure | undefined {
  if (isChoiceType(field.type)) return undefined;
  return failure("validation_failed", "Only choice fields have options.", [
    { path: "args.fieldId", message: "Not a single or multiple choice field" },
  ]);
}

/**
 * `field.changeType` (FR-03.12, FR-03.13): changes the type of a field no album uses, in Trash or not, even empty, if
 * it is still `base.type` (TS-21). Options stay between single and multiple choice and are discarded for any other
 * type; its `result` names those discarded. A used field is refused without touching anything.
 */
export async function changeFieldType(
  args: z.infer<typeof fieldChangeTypeArgsSchema>,
  base: { type: FieldType },
  context: CommandContext,
): Promise<CommandResult> {
  const field = ownField(await context.store.findField(args.id), context);
  if (isFailure(field)) return field;
  if (field.type !== base.type) return conflict("type", field.type, args.type, base.type);
  const none: FieldTypeChangeResult = { discardedOptions: [] };
  if (args.type === field.type) return { status: "applied", changes: [], result: none };
  const usage = await context.store.fieldUsage(field.id);
  if (usage.active + usage.trashed > 0) return fieldTypeInUse(usage);

  const discard = !isChoiceType(args.type);
  await context.store.changeFieldType(field.id, args.type, discard);
  const result: FieldTypeChangeResult = { discardedOptions: discard ? field.options : [] };
  return {
    status: "applied",
    changes: [fieldChange({ ...field, type: args.type, options: discard ? [] : field.options })],
    result,
  };
}

/**
 * `field.addOption` (FR-03.15): adds an option at the end of a choice field, chosen by no album. Its label is unique
 * in the field (FR-03.14). Sent again, the same option changes nothing (FR-13.5).
 */
export async function addFieldOption(
  args: z.infer<typeof fieldAddOptionArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const field = ownField(await context.store.findField(args.fieldId), context);
  if (isFailure(field)) return field;
  const label = args.label.trim();
  const existing = field.options.find((option) => option.id === args.id);
  if (existing) {
    return existing.label === label ? applied() : conflict("label", existing.label, label);
  }
  const notChoice = choiceField(field);
  if (notChoice) return notChoice;
  const problem = optionLabelProblem(label, "args.label");
  if (problem) return problem;
  if (await context.store.optionField(args.id)) {
    return failure("validation_failed", "This option ID is already in use.", [
      { path: "args.id", message: "Already in use" },
    ]);
  }
  const taken = optionLabelConflict(label, field.options);
  if (taken) return optionLabelTaken(taken.label);
  if (field.options.length >= maxFieldOptions) return optionLimitProblem();

  const option = { id: args.id, label };
  const sortKey = generateKeyBetween(await context.store.lastOptionKey(field.id), null);
  await context.store.insertFieldOption(field.id, { ...option, sortKey });
  return applied(fieldChange({ ...field, options: [...field.options, option] }));
}

/**
 * `field.renameOption` (FR-03.16): relabels the option, if it is still `base.label` (TS-21). It stays the same option,
 * with every selection; a case-only rename is a change.
 */
export async function renameFieldOption(
  args: z.infer<typeof fieldRenameOptionArgsSchema>,
  base: { label: string },
  context: CommandContext,
): Promise<CommandResult> {
  const field = ownField(await context.store.findField(args.fieldId), context);
  if (isFailure(field)) return field;
  const option = field.options.find((each) => each.id === args.optionId);
  if (!option) return failure("not_found", "This option doesn't exist.");
  const label = args.label.trim();
  if (option.label !== base.label) return conflict("label", option.label, label, base.label);
  const problem = optionLabelProblem(label, "args.label");
  if (problem) return problem;
  if (label === option.label) return applied();
  const taken = optionLabelConflict(label, field.options, option.id);
  if (taken) return optionLabelTaken(taken.label);

  await context.store.renameFieldOption(option.id, label);
  return applied(
    fieldChange({
      ...field,
      options: field.options.map((each) => (each.id === option.id ? { id: each.id, label } : each)),
    }),
  );
}

/**
 * `field.removeOption` (FR-03.17, TS-14): removes an option. One no album chooses goes at once; a chosen one goes only
 * with the hash of its scope as computed here, under the lock. Every album that chose it loses it, Trash included: a
 * single choice becomes empty and a multiple choice keeps its other selections, the field staying applied. Already
 * gone, it changes nothing.
 */
export async function removeFieldOption(
  args: z.infer<typeof fieldRemoveOptionArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const field = ownField(await context.store.findField(args.fieldId), context);
  if (isFailure(field)) return field;
  const option = field.options.find((each) => each.id === args.optionId);
  if (!option) return applied();
  const { store } = context;
  const users = await store.optionUsers(field.id, option.id);
  if (users.length > 0) {
    const scope = optionRemovalScope(field.id, option.id, users);
    if (args.scopeHash === undefined) {
      const trashed = users.filter((user) => user.trashed).length;
      return failure(
        "field_in_use",
        `'${option.label}' is chosen on ${usageText({ active: users.length - trashed, trashed })}. Confirm removing it from them.`,
      );
    }
    if (args.scopeHash !== (await optionRemovalHash(scope))) {
      return failure(
        "field_in_use",
        `The albums choosing '${option.label}' changed since you confirmed. Review the change and confirm again.`,
      );
    }
  }

  const values = await store.removeFieldOption(
    field.id,
    option.id,
    users.map((user) => user.id),
  );
  return applied(
    fieldChange({ ...field, options: field.options.filter((each) => each.id !== option.id) }),
    ...values.map((value): ChangeInput => ({
      entity: "fieldValue",
      id: fieldValueKey(value.albumId, value.fieldId),
      op: "update",
      data: value,
    })),
  );
}
