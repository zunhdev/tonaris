// A field's type and options after it is defined, against an in-memory store (FR-03.12 to FR-03.17, X-09, TS-14;
// AC-12's option checks, AC-13): type changes only without usage, applied-empty and Trash included; options kept,
// discarded and never restored; labels unique per field; and removal of a chosen option only for the scope confirmed.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import {
  optionRemoval,
  optionRemovalHash,
  optionRemovalScope,
  type FieldTypeChangeResult,
} from "./field-options";
import { fieldValueKey, type FieldValue } from "./field-values";
import type { FieldType, StoredField } from "./fields";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const benPrincipal: Principal = { kind: "user", userId: uuidv7(), role: "user", client: "web" };

const album = (trashed = false) => ({
  id: uuidv7(),
  title: "Bleach",
  artistCredit: "Nirvana",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1989,
  recordingYearStart: null,
  recordingYearEnd: null,
  ownerId: owner,
  trashed,
});

const field = (type: FieldType, labels: string[] = []): StoredField => ({
  id: uuidv7(),
  name: "Mood",
  type,
  options: labels.map((label) => ({ id: uuidv7(), label })),
  ownerId: owner,
});

const optionId = (of: StoredField, label: string) =>
  of.options.find((option) => option.label === label)?.id ?? "";

/** Runs a mutation, after checking it parses as the API would. */
async function run(
  context: ReturnType<typeof memoryStore>,
  mutation: Mutation,
  principal: Principal = anna,
): Promise<CommandResult> {
  const parsed = mutationSchema.parse(mutation);
  const result = await runCommand(parsed, { principal, store: context.store });
  if (result.status === "applied")
    for (const change of result.changes)
      changeSchema.parse({ ...change, seq: 1, mutationId: parsed.mutationId });
  return result;
}

const changeType = (id: string, type: FieldType, base: FieldType): Mutation => ({
  mutationId: uuidv7(),
  name: "field.changeType",
  args: { id, type },
  base: { type: base },
});
const addOption = (fieldId: string, label: string, id = uuidv7()): Mutation => ({
  mutationId: uuidv7(),
  name: "field.addOption",
  args: { fieldId, id, label },
});
const renameOption = (fieldId: string, id: string, label: string, base: string): Mutation => ({
  mutationId: uuidv7(),
  name: "field.renameOption",
  args: { fieldId, optionId: id, label },
  base: { label: base },
});
const removeOption = (fieldId: string, id: string, scopeHash?: string): Mutation => ({
  mutationId: uuidv7(),
  name: "field.removeOption",
  args: { fieldId, optionId: id, ...(scopeHash === undefined ? {} : { scopeHash }) },
});

const failedWith = (result: CommandResult) =>
  result.status === "failed" ? { code: result.code, detail: result.problem.detail } : result;

describe("type changes (FR-03.12, FR-03.13; AC-13)", () => {
  test("a field an album applies, even empty, keeps its type", async () => {
    const rating = field("number");
    const used = album();
    const context = memoryStore({
      albums: [used],
      fields: [rating],
      fieldValues: [{ albumId: used.id, fieldId: rating.id, value: null }],
    });
    expect(failedWith(await run(context, changeType(rating.id, "text", "number")))).toEqual({
      code: "field_in_use",
      detail: "Used by 1 album. Create a new field of the type you need instead.",
    });
    expect(context.fields.get(rating.id)?.type).toBe("number");
    expect(context.fieldValues.get(fieldValueKey(used.id, rating.id))).toBeNull();
  });

  test("albums in Trash count, and are named", async () => {
    const rating = field("number");
    const [active, trashed, other] = [album(), album(true), album(true)];
    const context = memoryStore({
      albums: [active, trashed, other],
      fields: [rating],
      fieldValues: [active, trashed, other].map((each) => ({
        albumId: each.id,
        fieldId: rating.id,
        value: "4",
      })),
    });
    expect(failedWith(await run(context, changeType(rating.id, "text", "number")))).toEqual({
      code: "field_in_use",
      detail: "Used by 3 albums (2 in Trash). Create a new field of the type you need instead.",
    });
    const onlyTrash = memoryStore({
      albums: [trashed],
      fields: [rating],
      fieldValues: [{ albumId: trashed.id, fieldId: rating.id, value: "4" }],
    });
    expect(failedWith(await run(onlyTrash, changeType(rating.id, "text", "number")))).toEqual({
      code: "field_in_use",
      detail: "Used by 1 album (1 in Trash). Create a new field of the type you need instead.",
    });
  });

  test("an unused field changes type, keeping its ID and name", async () => {
    const rating = field("number");
    const context = memoryStore({ fields: [rating] });
    const result = await run(context, changeType(rating.id, "text", "number"));
    expect(result).toMatchObject({ status: "applied", result: { discardedOptions: [] } });
    expect(context.fields.get(rating.id)).toMatchObject({
      id: rating.id,
      name: "Mood",
      type: "text",
    });
  });

  test("options stay between choice types, and are discarded, reported and not restored otherwise", async () => {
    const mood = field("single_choice", ["Calm", "Loud"]);
    const context = memoryStore({ fields: [mood] });
    await run(context, changeType(mood.id, "multiple_choice", "single_choice"));
    expect(context.fields.get(mood.id)?.options).toEqual(mood.options);

    const toText = await run(context, changeType(mood.id, "text", "multiple_choice"));
    const discarded: FieldTypeChangeResult = { discardedOptions: mood.options };
    expect(toText).toMatchObject({ status: "applied", result: discarded });
    expect(context.fields.get(mood.id)?.options).toEqual([]);

    await run(context, changeType(mood.id, "single_choice", "text"));
    expect(context.fields.get(mood.id)).toMatchObject({ type: "single_choice", options: [] });
  });

  test("a type changed elsewhere is a conflict, and the same type changes nothing", async () => {
    const rating = field("number");
    const context = memoryStore({ fields: [rating] });
    expect(await run(context, changeType(rating.id, "date", "text"))).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "type", current: "number", attempted: "date", base: "text" }],
    });
    expect(await run(context, changeType(rating.id, "number", "number"))).toMatchObject({
      status: "applied",
      changes: [],
    });
  });

  test("someone else's field is not found", async () => {
    const rating = field("number");
    const context = memoryStore({ fields: [rating] });
    expect(
      failedWith(await run(context, changeType(rating.id, "text", "number"), benPrincipal)),
    ).toMatchObject({ code: "permission_denied" });
  });
});

describe("adding and renaming options (FR-03.14 to FR-03.16; AC-12)", () => {
  test("an option is added at the end, chosen by no album", async () => {
    const mood = field("single_choice", ["Calm"]);
    const context = memoryStore({ fields: [mood] });
    const id = uuidv7();
    expect(await run(context, addOption(mood.id, "  Loud ", id))).toMatchObject({
      status: "applied",
      changes: [{ entity: "field", op: "update" }],
    });
    expect(context.fields.get(mood.id)?.options).toEqual([...mood.options, { id, label: "Loud" }]);
    // Sent again, it changes nothing (FR-13.5).
    expect(await run(context, addOption(mood.id, "Loud", id))).toEqual({
      status: "applied",
      changes: [],
    });
    expect(await run(context, addOption(mood.id, "Odd", uuidv7()))).toMatchObject({
      status: "applied",
    });
    expect(context.fields.get(mood.id)?.options.map((o) => o.label)).toEqual([
      "Calm",
      "Loud",
      "Odd",
    ]);
  });

  test("labels are unique per field, ignoring case, and only choice fields have options", async () => {
    const mood = field("multiple_choice", ["Calm"]);
    const other = field("single_choice", ["Calm"]);
    const rating = field("number");
    const context = memoryStore({ fields: [mood, other, rating] });
    expect(failedWith(await run(context, addOption(mood.id, "calm")))).toEqual({
      code: "name_conflict",
      detail: "'Calm' already exists. Choose another label.",
    });
    expect(failedWith(await run(context, addOption(mood.id, " ")))).toMatchObject({
      code: "validation_failed",
      detail: "Give each option a label.",
    });
    expect(failedWith(await run(context, addOption(rating.id, "Five")))).toMatchObject({
      code: "validation_failed",
      detail: "Only choice fields have options.",
    });
    // Another field's option ID.
    expect(
      failedWith(await run(context, addOption(mood.id, "Loud", other.options[0]?.id))),
    ).toMatchObject({ code: "validation_failed", detail: "This option ID is already in use." });
  });

  test("a field has at most 100 options", async () => {
    const many = field(
      "single_choice",
      Array.from({ length: 100 }, (_, index) => `Option ${index}`),
    );
    const context = memoryStore({ fields: [many] });
    expect(failedWith(await run(context, addOption(many.id, "One more")))).toEqual({
      code: "limit_exceeded",
      detail: "A choice field can have at most 100 options.",
    });
  });

  test("a renamed option keeps its selections, case-only renames included", async () => {
    const mood = field("multiple_choice", ["Calm", "Loud"]);
    const calm = optionId(mood, "Calm");
    const chosen = album();
    const context = memoryStore({
      albums: [chosen],
      fields: [mood],
      fieldValues: [{ albumId: chosen.id, fieldId: mood.id, value: [calm] }],
    });
    expect(await run(context, renameOption(mood.id, calm, "Quiet", "Calm"))).toMatchObject({
      status: "applied",
    });
    expect(await run(context, renameOption(mood.id, calm, "quiet", "Quiet"))).toMatchObject({
      status: "applied",
      changes: [{ entity: "field" }],
    });
    expect(context.fields.get(mood.id)?.options[0]).toEqual({ id: calm, label: "quiet" });
    expect(context.fieldValues.get(fieldValueKey(chosen.id, mood.id))).toEqual([calm]);
  });

  test("a rename checks the label and the label last seen", async () => {
    const mood = field("single_choice", ["Calm", "Loud"]);
    const calm = optionId(mood, "Calm");
    const context = memoryStore({ fields: [mood] });
    expect(failedWith(await run(context, renameOption(mood.id, calm, "LOUD", "Calm")))).toEqual({
      code: "name_conflict",
      detail: "'Loud' already exists. Choose another label.",
    });
    expect(await run(context, renameOption(mood.id, calm, "Quiet", "Still"))).toMatchObject({
      status: "conflict",
      conflicts: [{ field: "label", current: "Calm", attempted: "Quiet", base: "Still" }],
    });
    expect(
      failedWith(await run(context, renameOption(mood.id, uuidv7(), "Quiet", "Calm"))),
    ).toMatchObject({ code: "not_found" });
  });
});

/** A single-choice "Mood" on two albums, one in Trash, and a multiple-choice "Tags" on two. */
function choices() {
  const mood = field("single_choice", ["Calm", "Loud"]);
  const tags = field("multiple_choice", ["Live", "Odd"]);
  const [first, second, trashed] = [album(), album(), album(true)];
  const [calm, live, odd] = [optionId(mood, "Calm"), optionId(tags, "Live"), optionId(tags, "Odd")];
  const fieldValues: FieldValue[] = [
    { albumId: first.id, fieldId: mood.id, value: calm },
    { albumId: trashed.id, fieldId: mood.id, value: calm },
    { albumId: first.id, fieldId: tags.id, value: [live, odd] },
    { albumId: second.id, fieldId: tags.id, value: [live] },
  ];
  const context = memoryStore({
    albums: [first, second, trashed],
    fields: [mood, tags],
    fieldValues,
  });
  return { context, mood, tags, first, second, trashed, calm, live, odd };
}

describe("removing options (FR-03.17, X-09, TS-14; AC-12)", () => {
  test("an option no album chooses is removed without a confirmation", async () => {
    const { context, mood } = choices();
    const loud = optionId(mood, "Loud");
    expect(await run(context, removeOption(mood.id, loud))).toMatchObject({
      status: "applied",
      changes: [{ entity: "field" }],
    });
    expect(context.fields.get(mood.id)?.options.map((o) => o.label)).toEqual(["Calm"]);
    // Already gone, it changes nothing.
    expect(await run(context, removeOption(mood.id, loud))).toEqual({
      status: "applied",
      changes: [],
    });
  });

  test("a chosen option needs the hash of its scope, and nothing changes without it", async () => {
    const { context, mood, calm } = choices();
    expect(failedWith(await run(context, removeOption(mood.id, calm)))).toEqual({
      code: "field_in_use",
      detail: "'Calm' is chosen on 2 albums (1 in Trash). Confirm removing it from them.",
    });
    expect(failedWith(await run(context, removeOption(mood.id, calm, "0".repeat(64))))).toEqual({
      code: "field_in_use",
      detail:
        "The albums choosing 'Calm' changed since you confirmed. Review the change and confirm again.",
    });
    expect(context.fields.get(mood.id)?.options).toHaveLength(2);
  });

  test("a scope that grew after confirming is refused", async () => {
    const { context, mood, calm, second } = choices();
    const users = await context.store.optionUsers(mood.id, calm);
    const confirmed = (await optionRemoval(mood, { id: calm, label: "Calm" }, users)).scopeHash;
    // Another album chooses "Calm" before the removal runs.
    await run(context, {
      mutationId: uuidv7(),
      name: "fieldValue.apply",
      args: { albumId: second.id, fieldId: mood.id },
    });
    await run(context, {
      mutationId: uuidv7(),
      name: "fieldValue.set",
      args: { albumId: second.id, fieldId: mood.id, value: calm },
      base: { value: null },
    });
    expect(failedWith(await run(context, removeOption(mood.id, calm, confirmed)))).toMatchObject({
      code: "field_in_use",
    });
  });

  test("confirmed, a single choice becomes empty everywhere, Trash included", async () => {
    const { context, mood, calm, first, trashed } = choices();
    const removal = await optionRemoval(
      mood,
      { id: calm, label: "Calm" },
      await context.store.optionUsers(mood.id, calm),
    );
    expect(removal).toMatchObject({
      field: { id: mood.id, name: "Mood" },
      option: { id: calm, label: "Calm" },
      albums: 1,
      inTrash: 1,
    });
    const result = await run(context, removeOption(mood.id, calm, removal.scopeHash));
    expect(result).toMatchObject({ status: "applied" });
    expect(result.status === "applied" && result.changes.map((change) => change.entity)).toEqual([
      "field",
      "fieldValue",
      "fieldValue",
    ]);
    expect(context.fieldValues.get(fieldValueKey(first.id, mood.id))).toBeNull();
    expect(context.fieldValues.get(fieldValueKey(trashed.id, mood.id))).toBeNull();
    expect(context.fieldValues.has(fieldValueKey(trashed.id, mood.id))).toBe(true);
  });

  test("confirmed, a multiple choice keeps its other selections, or stays applied and empty", async () => {
    const { context, tags, live, odd, first, second } = choices();
    const scope = optionRemovalScope(tags.id, live, [
      { id: first.id, trashed: false },
      { id: second.id, trashed: false },
    ]);
    const result = await run(context, removeOption(tags.id, live, await optionRemovalHash(scope)));
    expect(result).toMatchObject({
      status: "applied",
      changes: [
        { entity: "field" },
        { entity: "fieldValue", data: { albumId: first.id, value: [odd] } },
        { entity: "fieldValue", data: { albumId: second.id, value: null } },
      ],
    });
    expect(context.fieldValues.get(fieldValueKey(first.id, tags.id))).toEqual([odd]);
    expect(context.fieldValues.get(fieldValueKey(second.id, tags.id))).toBeNull();
  });

  test("a removed label added again is a new option, chosen by no album", async () => {
    const { context, tags, live, first, second } = choices();
    const scope = optionRemovalScope(tags.id, live, [
      { id: first.id, trashed: false },
      { id: second.id, trashed: false },
    ]);
    await run(context, removeOption(tags.id, live, await optionRemovalHash(scope)));
    const again = uuidv7();
    expect(await run(context, addOption(tags.id, "Live", again))).toMatchObject({
      status: "applied",
    });
    expect(await context.store.optionUsers(tags.id, again)).toEqual([]);
    expect(context.fieldValues.get(fieldValueKey(second.id, tags.id))).toBeNull();
  });

  test("the scope hashes the same whatever the albums' order", async () => {
    const [a, b] = [uuidv7(), uuidv7()];
    const one = optionRemovalScope("f", "o", [
      { id: a, trashed: false },
      { id: b, trashed: true },
    ]);
    const other = optionRemovalScope("f", "o", [
      { id: b, trashed: true },
      { id: a, trashed: false },
    ]);
    expect(await optionRemovalHash(one)).toBe(await optionRemovalHash(other));
    expect(await optionRemovalHash(one)).not.toBe(
      await optionRemovalHash(optionRemovalScope("f", "o", [{ id: a, trashed: false }])),
    );
  });
});
