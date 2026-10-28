// Custom fields on albums against an in-memory store (FR-03.7, FR-03.8, FR-03.10, TS-21; AC-11): applied-empty apart
// from unused and from any value, removal clearing the value, every type's checks, and compare-and-set.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import { fieldValueKey, fieldValueProblem, type FieldValueData } from "./field-values";
import type { FieldType, StoredField } from "./fields";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const ben = uuidv7();
const benPrincipal: Principal = { kind: "user", userId: ben, role: "user", client: "web" };

const album = (ownerId = owner) => ({
  id: uuidv7(),
  title: "Bleach",
  artistCredit: "Nirvana",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1989,
  recordingYearStart: null,
  recordingYearEnd: null,
  ownerId,
});

const field = (type: FieldType, labels: string[] = [], ownerId = owner): StoredField => ({
  id: uuidv7(),
  name: type,
  type,
  options: labels.map((label) => ({ id: uuidv7(), label })),
  ownerId,
});

const apply = (albumId: string, fieldId: string): Mutation => ({
  mutationId: uuidv7(),
  name: "fieldValue.apply",
  args: { albumId, fieldId },
});
const set = (
  albumId: string,
  fieldId: string,
  value: FieldValueData,
  base: FieldValueData,
): Mutation => ({
  mutationId: uuidv7(),
  name: "fieldValue.set",
  args: { albumId, fieldId, value },
  base: { value: base },
});
const remove = (albumId: string, fieldId: string): Mutation => ({
  mutationId: uuidv7(),
  name: "fieldValue.remove",
  args: { albumId, fieldId },
});

function applied(result: CommandResult) {
  if (result.status !== "applied") throw new Error(`Expected applied, got ${result.status}`);
  for (const each of result.changes) changeSchema.parse({ ...each, seq: 1, mutationId: null });
  return result;
}

describe("applying and removing fields (FR-03.7, FR-03.8)", () => {
  test("applied-empty is neither unused, zero nor No", async () => {
    const bleach = album();
    const rating = field("number");
    const owned = field("yes_no");
    const memory = memoryStore({ albums: [bleach], fields: [rating, owned] });
    const run = (mutation: Mutation) =>
      runCommand(mutation, { principal: anna, store: memory.store });
    expect(memory.fieldValues.has(fieldValueKey(bleach.id, rating.id))).toBe(false);

    const mutation = apply(bleach.id, rating.id);
    expect(mutationSchema.parse(mutation)).toEqual(mutation);
    expect(applied(await run(mutation)).changes).toEqual([
      {
        entity: "fieldValue",
        id: fieldValueKey(bleach.id, rating.id),
        op: "insert",
        data: { albumId: bleach.id, fieldId: rating.id, value: null },
      },
    ]);
    applied(await run(apply(bleach.id, owned.id)));
    expect(memory.fieldValues.get(fieldValueKey(bleach.id, rating.id))).toBeNull();
    expect(memory.fieldValues.get(fieldValueKey(bleach.id, owned.id))).toBeNull();
    // Applying again changes nothing.
    expect(await run(apply(bleach.id, rating.id))).toEqual({ status: "applied", changes: [] });
  });

  test("removed and applied again, a field starts empty; other albums keep theirs", async () => {
    const [bleach, nevermind] = [album(), album()];
    const rating = field("number");
    const memory = memoryStore({
      albums: [bleach, nevermind],
      fields: [rating],
      fieldValues: [
        { albumId: bleach.id, fieldId: rating.id, value: "4" },
        { albumId: nevermind.id, fieldId: rating.id, value: "5" },
      ],
    });
    const run = (mutation: Mutation) =>
      runCommand(mutation, { principal: anna, store: memory.store });
    expect(applied(await run(remove(bleach.id, rating.id))).changes).toEqual([
      { entity: "fieldValue", id: fieldValueKey(bleach.id, rating.id), op: "delete", data: null },
    ]);
    applied(await run(apply(bleach.id, rating.id)));
    expect(memory.fieldValues.get(fieldValueKey(bleach.id, rating.id))).toBeNull();
    expect(memory.fieldValues.get(fieldValueKey(nevermind.id, rating.id))).toBe("5");
    expect(memory.fields.get(rating.id)?.name).toBe("number");
  });

  test("clearing a value keeps the field applied", async () => {
    const bleach = album();
    const notes = field("text");
    const memory = memoryStore({
      albums: [bleach],
      fields: [notes],
      fieldValues: [{ albumId: bleach.id, fieldId: notes.id, value: "Loud" }],
    });
    applied(
      await runCommand(set(bleach.id, notes.id, null, "Loud"), {
        principal: anna,
        store: memory.store,
      }),
    );
    expect(memory.fieldValues.get(fieldValueKey(bleach.id, notes.id))).toBeNull();
  });
});

describe("values by type (FR-03.10)", () => {
  const mood = field("multiple_choice", ["Calm", "Loud", "Odd"]);
  const [calm, loud, odd] = mood.options.map((option) => option.id);
  const pick = field("single_choice", ["Yes please"]);

  test("each type takes its values, stored as checked", async () => {
    const cases: [StoredField, FieldValueData, FieldValueData][] = [
      [field("text"), "  Loud and fast ", "Loud and fast"],
      [field("text"), "   ", null],
      [field("number"), "-4.50", "-4.50"],
      [field("number"), ".5", ".5"],
      [field("date"), "2024-02-29", "2024-02-29"],
      [field("yes_no"), false, false],
      [pick, pick.options[0]?.id ?? "", pick.options[0]?.id ?? ""],
      // Kept in the field's option order.
      [mood, [odd ?? "", calm ?? ""], [calm ?? "", odd ?? ""]],
      [mood, [], null],
    ];
    for (const [each, value, stored] of cases) {
      const bleach = album();
      const memory = memoryStore({
        albums: [bleach],
        fields: [each],
        fieldValues: [{ albumId: bleach.id, fieldId: each.id, value: null }],
      });
      // oxlint-disable-next-line no-await-in-loop
      const result = await runCommand(set(bleach.id, each.id, value, null), {
        principal: anna,
        store: memory.store,
      });
      expect(result.status).toBe("applied");
      expect(memory.fieldValues.get(fieldValueKey(bleach.id, each.id))).toEqual(stored);
    }
  });

  test("anything else is refused with its reason, and nothing changes", async () => {
    const cases: [StoredField, FieldValueData, string][] = [
      [field("number"), "four", "Enter a number, such as 4.5."],
      [field("number"), "1,5", "Enter a number, such as 4.5."],
      [field("date"), "2026-02-30", "Enter a date as YYYY-MM-DD, such as 2026-10-28."],
      [field("date"), "28.10.2026", "Enter a date as YYYY-MM-DD, such as 2026-10-28."],
      [field("yes_no"), "yes", "Choose Yes or No."],
      [field("text"), "x".repeat(2_001), "Text can be at most 2,000 characters."],
      [pick, uuidv7(), "Choose one of the field's options."],
      [mood, [loud ?? "", loud ?? ""], "Choose each option once."],
      [mood, [uuidv7()], "Choose one of the field's options."],
    ];
    for (const [each, value, reason] of cases) {
      expect(fieldValueProblem(each, value)?.problem.detail).toBe(reason);
      const bleach = album();
      const memory = memoryStore({
        albums: [bleach],
        fields: [each],
        fieldValues: [{ albumId: bleach.id, fieldId: each.id, value: null }],
      });
      // oxlint-disable-next-line no-await-in-loop
      const result = await runCommand(set(bleach.id, each.id, value, null), {
        principal: anna,
        store: memory.store,
      });
      expect(result).toMatchObject({ status: "failed", code: "validation_failed" });
      expect(memory.fieldValues.get(fieldValueKey(bleach.id, each.id))).toBeNull();
    }
  });
});

describe("compare-and-set and ownership (TS-21, X-05)", () => {
  test("a value changed elsewhere is a conflict; a multiple choice compares as a set", async () => {
    const bleach = album();
    const rating = field("number");
    const mood = field("multiple_choice", ["Calm", "Loud"]);
    const [calm, loud] = mood.options.map((option) => option.id);
    const memory = memoryStore({
      albums: [bleach],
      fields: [rating, mood],
      fieldValues: [
        { albumId: bleach.id, fieldId: rating.id, value: "5" },
        { albumId: bleach.id, fieldId: mood.id, value: [calm ?? "", loud ?? ""] },
      ],
    });
    expect(
      await runCommand(set(bleach.id, rating.id, "3", "4"), {
        principal: anna,
        store: memory.store,
      }),
    ).toEqual({
      status: "conflict",
      conflicts: [{ field: "value", current: "5", attempted: "3", base: "4" }],
    });
    expect(memory.fieldValues.get(fieldValueKey(bleach.id, rating.id))).toBe("5");
    const reordered = await runCommand(
      set(bleach.id, mood.id, [calm ?? ""], [loud ?? "", calm ?? ""]),
      { principal: anna, store: memory.store },
    );
    expect(reordered.status).toBe("applied");
  });

  test("a set on an unused field, someone else's album and another owner's field are refused", async () => {
    const bleach = album();
    const theirs = album(ben);
    const rating = field("number");
    const foreign = field("number", [], ben);
    const memory = memoryStore({ albums: [bleach, theirs], fields: [rating, foreign] });
    expect(
      await runCommand(set(bleach.id, rating.id, "4", null), {
        principal: anna,
        store: memory.store,
      }),
    ).toMatchObject({ code: "not_found", problem: { detail: "This field isn't on this album." } });
    expect(
      await runCommand(apply(theirs.id, rating.id), { principal: anna, store: memory.store }),
    ).toMatchObject({ code: "permission_denied" });
    expect(
      await runCommand(apply(bleach.id, foreign.id), { principal: anna, store: memory.store }),
    ).toMatchObject({ code: "not_found" });
    expect(
      await runCommand(apply(theirs.id, foreign.id), {
        principal: benPrincipal,
        store: memory.store,
      }),
    ).toMatchObject({ status: "applied" });
    expect(memory.fieldValues.size).toBe(1);
  });
});
