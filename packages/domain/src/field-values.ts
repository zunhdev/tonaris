// Custom fields on albums (TON-50): which fields an album applies, and their values (FR-03.7, FR-03.8, FR-03.10). A
// record means the field is applied; a null value means applied-empty; no record means unused. They stay apart, and
// an empty value is never replaced with zero, No or a default choice. Removing a field from an album clears its
// value, so applying it again starts empty. Values are checked against their field's type, here, by the server and
// by the editors, with the same words.

import { changeableAlbum } from "./albums";
import { applied, conflict, isFailure } from "./command-kit";
import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import type { CustomField, StoredField } from "./fields";
import { failure, type Failure } from "./outcomes";
import { z } from "./zod";

/** Characters in a text value, counted in code points (TS-18). */
export const maxTextValueLength = 2_000;

/**
 * A field's value on an album: text, a decimal number as a string, a `YYYY-MM-DD` date, yes/no, an option ID, or
 * option IDs; null is applied-empty (FR-03.7).
 */
export const fieldValueDataSchema = z
  .union([z.string(), z.boolean(), z.array(z.string())])
  .nullable()
  .meta({
    description:
      "Text; a decimal number as a string; a `YYYY-MM-DD` date; true or false; an option ID; or option IDs. Null is applied-empty (FR-03.7).",
  });
export type FieldValueData = z.infer<typeof fieldValueDataSchema>;

/** A field applied to an album, with its value (FR-03.7). */
export const fieldValueSchema = z
  .object({ albumId: z.uuid(), fieldId: z.uuid(), value: fieldValueDataSchema })
  .meta({ description: "A custom field applied to an album, with its value (FR-03.7)." });
export type FieldValue = z.infer<typeof fieldValueSchema>;

/** A value's key in the change log and on clients: the album's ID and the field's, joined by a colon. */
export function fieldValueKey(albumId: string, fieldId: string): string {
  return `${albumId}:${fieldId}`;
}

const decimal = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `text` is a real calendar date written `YYYY-MM-DD`. */
function isCalendarDate(text: string): boolean {
  const parts = isoDate.exec(text);
  if (!parts) return false;
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const refuse = (detail: string) =>
  failure("validation_failed", detail, [{ path: "args.value", message: detail }]);

/** The words a refused value gets, for the server and the editors alike (DS-26). */
export const valueRefusals = {
  text: `Text can be at most ${maxTextValueLength.toLocaleString("en")} characters.`,
  number: "Enter a number, such as 4.5.",
  date: "Enter a date as YYYY-MM-DD, such as 2026-10-28.",
  yesNo: "Choose Yes or No.",
  option: "Choose one of the field's options.",
  repeat: "Choose each option once.",
};

/**
 * The value as stored, or why `field` can't take it (FR-03.10): text trimmed, empty text and empty selections as
 * null, numbers without a leading `+`, and selections in the field's option order.
 */
export function normalizedValue(
  field: CustomField,
  value: FieldValueData,
): FieldValueData | Failure {
  if (value === null) return null;
  const optionIds = field.options.map((option) => option.id);
  const { type } = field;
  if (type === "text" || type === "number" || type === "date") {
    const refusal = type === "text" ? valueRefusals.text : valueRefusals[type];
    if (typeof value !== "string") return refuse(refusal);
    const text = value.trim();
    if (text === "") return null;
    // oxlint-disable-next-line no-misused-spread
    if (type === "text") return [...text].length > maxTextValueLength ? refuse(refusal) : text;
    if (type === "number") return decimal.test(text) ? text : refuse(refusal);
    return isCalendarDate(text) ? text : refuse(refusal);
  }
  if (type === "yes_no") return typeof value === "boolean" ? value : refuse(valueRefusals.yesNo);
  if (type === "single_choice") {
    return typeof value === "string" && optionIds.includes(value)
      ? value
      : refuse(valueRefusals.option);
  }
  // A multiple choice: a set of the field's options.
  if (!Array.isArray(value)) return refuse(valueRefusals.option);
  if (new Set(value).size !== value.length) return refuse(valueRefusals.repeat);
  if (!value.every((id) => optionIds.includes(id))) return refuse(valueRefusals.option);
  return value.length === 0 ? null : optionIds.filter((id) => value.includes(id));
}

/** Why `value` can't be `field`'s, if it can't (FR-03.10). Editors check it before sending. */
export function fieldValueProblem(field: CustomField, value: FieldValueData): Failure | undefined {
  const normalized = normalizedValue(field, value);
  return isFailure(normalized) ? normalized : undefined;
}

/** Whether two stored values are the same, a multiple choice as a set. */
export function sameValue(a: FieldValueData, b: FieldValueData): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((id) => b.includes(id));
  }
  return a === b;
}

type ValueArgs = { albumId: string; fieldId: string };

/**
 * The field a value change is about, if the album is the principal's to change and the field its owner's. A missing
 * album is `not_found`, and someone else's gets the policy's code; a missing field and another owner's get the same
 * answer, so nobody can probe for other people's IDs.
 */
async function target(
  { albumId, fieldId }: ValueArgs,
  context: CommandContext,
): Promise<StoredField | Failure> {
  const album = await changeableAlbum(albumId, context);
  if (isFailure(album)) return album;
  const field = await context.store.findField(fieldId);
  if (!field || field.ownerId !== album.ownerId) {
    return failure("not_found", "This field doesn't exist.");
  }
  return field;
}

const change = (
  albumId: string,
  fieldId: string,
  value: FieldValueData | undefined,
): ChangeInput => ({
  entity: "fieldValue",
  id: fieldValueKey(albumId, fieldId),
  op: value === undefined ? "delete" : "update",
  data: value === undefined ? null : { albumId, fieldId, value },
});

/** `fieldValue.apply` (FR-03.7): applies the field to the album, empty. Already applied, it changes nothing. */
export async function applyField(args: ValueArgs, context: CommandContext): Promise<CommandResult> {
  const field = await target(args, context);
  if (isFailure(field)) return field;
  const { store } = context;
  if ((await store.findFieldValue(args.albumId, args.fieldId)) !== undefined) return applied();
  await store.applyField(args.albumId, args.fieldId);
  return applied({ ...change(args.albumId, args.fieldId, null), op: "insert" });
}

/**
 * `fieldValue.set` (FR-03.7, FR-03.10): sets or clears the value of a field the album applies, if it is still
 * `base.value` (TS-21). The value must suit the field's type; null clears it, and the field stays applied.
 */
export async function setFieldValue(
  args: ValueArgs & { value: FieldValueData },
  base: { value: FieldValueData },
  context: CommandContext,
): Promise<CommandResult> {
  const field = await target(args, context);
  if (isFailure(field)) return field;
  const { store } = context;
  const current = await store.findFieldValue(args.albumId, args.fieldId);
  if (current === undefined) return failure("not_found", "This field isn't on this album.");
  if (!sameValue(current, base.value)) return conflict("value", current, args.value, base.value);
  const value = normalizedValue(field, args.value);
  if (isFailure(value)) return value;
  if (sameValue(current, value)) return applied();
  await store.setFieldValue(args.albumId, field, value);
  return applied(change(args.albumId, args.fieldId, value));
}

/**
 * `fieldValue.remove` (FR-03.8): takes the field off the album with its value, so applying it again starts empty.
 * The definition, its options and other albums are unaffected. Already unused, it changes nothing.
 */
export async function removeField(
  args: ValueArgs,
  context: CommandContext,
): Promise<CommandResult> {
  const field = await target(args, context);
  if (isFailure(field)) return field;
  const { store } = context;
  if ((await store.findFieldValue(args.albumId, args.fieldId)) === undefined) return applied();
  await store.removeField(args.albumId, args.fieldId);
  return applied(change(args.albumId, args.fieldId, undefined));
}
