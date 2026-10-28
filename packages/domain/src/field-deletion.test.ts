// Deleting a custom field against an in-memory store (FR-03.18, X-09, TS-14; AC-12's deletion checks): always
// confirmed, even unused; the scope's hash going stale when an album applies the field or an option is added; every
// album's usage removed, Trash included; and the name free again for a field that inherits nothing.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import { fieldDeletion } from "./field-deletion";
import { fieldValueKey } from "./field-values";
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

async function run(
  context: ReturnType<typeof memoryStore>,
  mutation: Mutation,
  principal: Principal = anna,
): Promise<CommandResult> {
  const parsed = mutationSchema.parse(mutation);
  const result = await runCommand(parsed, { principal, store: context.store });
  if (result.status === "applied") {
    for (const change of result.changes) {
      changeSchema.parse({ ...change, seq: 1, mutationId: parsed.mutationId });
    }
  }
  return result;
}

const remove = (id: string, scopeHash: string): Mutation => ({
  mutationId: uuidv7(),
  name: "field.delete",
  args: { id, scopeHash },
});

/** The hash the deletion read would give now. */
async function confirmedHash(context: ReturnType<typeof memoryStore>, id: string) {
  const stored = context.fields.get(id);
  if (!stored) throw new Error("No such field");
  return (await fieldDeletion(stored, await context.store.fieldUsers(id))).scopeHash;
}

const failedWith = (result: CommandResult) =>
  result.status === "failed" ? { code: result.code, detail: result.problem.detail } : result;

describe("deleting a field (FR-03.18, X-09, TS-14; AC-12)", () => {
  test("an unused field is deleted once confirmed, and deleting it again changes nothing", async () => {
    const rating = field("number");
    const context = memoryStore({ fields: [rating] });
    const hash = await confirmedHash(context, rating.id);
    expect(await run(context, remove(rating.id, hash))).toEqual({
      status: "applied",
      changes: [{ entity: "field", id: rating.id, op: "delete", data: null }],
    });
    expect(context.fields.has(rating.id)).toBe(false);
    expect(await run(context, remove(rating.id, hash))).toEqual({ status: "applied", changes: [] });
  });

  test("a used field goes with every album's usage and value, Trash included", async () => {
    const mood = field("multiple_choice", ["Calm", "Odd"]);
    const [active, trashed] = [album(), album(true)];
    const context = memoryStore({
      albums: [active, trashed],
      fields: [mood],
      fieldValues: [
        { albumId: active.id, fieldId: mood.id, value: [mood.options[0]?.id ?? ""] },
        { albumId: trashed.id, fieldId: mood.id, value: null },
      ],
    });
    const deletion = await fieldDeletion(mood, await context.store.fieldUsers(mood.id));
    expect(deletion).toMatchObject({
      field: { id: mood.id, name: "Mood", type: "multiple_choice" },
      options: mood.options,
      albums: 1,
      inTrash: 1,
    });
    const result = await run(context, remove(mood.id, deletion.scopeHash));
    expect(result.status === "applied" && result.changes.map((c) => [c.entity, c.op])).toEqual([
      ["field", "delete"],
      ["fieldValue", "delete"],
      ["fieldValue", "delete"],
    ]);
    expect(context.fieldValues.has(fieldValueKey(active.id, mood.id))).toBe(false);
    expect(context.fieldValues.has(fieldValueKey(trashed.id, mood.id))).toBe(false);
  });

  test("a hash goes stale when an album applies the field or an option is added", async () => {
    const mood = field("single_choice", ["Calm"]);
    const bleach = album();
    const context = memoryStore({ albums: [bleach], fields: [mood] });
    const before = await confirmedHash(context, mood.id);
    await run(context, {
      mutationId: uuidv7(),
      name: "fieldValue.apply",
      args: { albumId: bleach.id, fieldId: mood.id },
    });
    const stale = {
      code: "field_in_use",
      detail: "'Mood' changed since you confirmed. Review the deletion and confirm again.",
    } as const;
    expect(failedWith(await run(context, remove(mood.id, before)))).toEqual(stale);

    const applied = await confirmedHash(context, mood.id);
    await run(context, {
      mutationId: uuidv7(),
      name: "field.addOption",
      args: { fieldId: mood.id, id: uuidv7(), label: "Loud" },
    });
    expect(failedWith(await run(context, remove(mood.id, applied)))).toEqual(stale);
    expect(context.fields.has(mood.id)).toBe(true);
    expect(context.fieldValues.has(fieldValueKey(bleach.id, mood.id))).toBe(true);
  });

  test("someone else's field is not found", async () => {
    const rating = field("number");
    const context = memoryStore({ fields: [rating] });
    const hash = await confirmedHash(context, rating.id);
    expect(failedWith(await run(context, remove(rating.id, hash), benPrincipal))).toEqual({
      code: "not_found",
      detail: "This field doesn't exist.",
    });
    expect(context.fields.has(rating.id)).toBe(true);
  });

  test("the name is free again, for a field that inherits nothing", async () => {
    const mood = field("single_choice", ["Calm"]);
    const bleach = album();
    const context = memoryStore({
      albums: [bleach],
      fields: [mood],
      fieldValues: [{ albumId: bleach.id, fieldId: mood.id, value: mood.options[0]?.id ?? null }],
    });
    await run(context, remove(mood.id, await confirmedHash(context, mood.id)));
    const again = uuidv7();
    expect(
      await run(context, {
        mutationId: uuidv7(),
        name: "field.create",
        args: { id: again, name: "Mood", type: "single_choice", options: [] },
      }),
    ).toMatchObject({ status: "applied" });
    expect(await context.store.fieldUsers(again)).toEqual([]);
  });
});
