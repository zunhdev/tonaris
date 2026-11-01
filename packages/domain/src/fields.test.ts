// The field definition commands against an in-memory store (FR-03.6, FR-03.9, FR-03.11, X-06, TS-18): one test per
// spec scenario. The database layer runs the same commands under the owner's write lock, and its tests cover renames
// reaching albums in Trash.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import {
  fieldDefinitionProblems,
  fieldLimitProblem,
  optionLabelConflict,
  optionLimitProblem,
  type StoredField,
} from "./fields";
import { uuidv7 } from "./ids";
import { maxFieldOptions, maxFields } from "./limits";
import type { Principal } from "./principals";
import { changeSchema, mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const anna: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const ben = uuidv7();
const benPrincipal: Principal = { kind: "user", userId: ben, role: "user", client: "web" };
const readOnly: Principal = { kind: "mcp", userId: owner, grantId: uuidv7(), mode: "read_only" };

type Args = Extract<Mutation, { name: "field.create" }>["args"];

const create = (name: string, type: Args["type"], labels: string[] = []): Mutation => ({
  mutationId: uuidv7(),
  name: "field.create",
  args: { id: uuidv7(), name, type, options: labels.map((label) => ({ id: uuidv7(), label })) },
});

const rename = (id: string, name: string, base: string): Mutation => ({
  mutationId: uuidv7(),
  name: "field.rename",
  args: { id, name },
  base: { name: base },
});

const stored = (name: string, values: Partial<StoredField> = {}): StoredField => ({
  id: uuidv7(),
  name,
  type: "number",
  options: [],
  ownerId: owner,
  ...values,
});

function applied(result: CommandResult) {
  if (result.status !== "applied") throw new Error(`Expected applied, got ${result.status}`);
  for (const change of result.changes) changeSchema.parse({ ...change, seq: 1, mutationId: null });
  return result;
}

const failed = (result: CommandResult) =>
  result.status === "failed" ? result.code : result.status;

describe("field.create (FR-03.6)", () => {
  test("a choice field takes its options, in order, and is applied to no album", async () => {
    const memory = memoryStore();
    const mutation = create(" Mood ", "single_choice", ["Calm", " Loud "]);
    expect(mutationSchema.parse(mutation)).toEqual(mutation);
    const result = applied(await runCommand(mutation, { principal: anna, store: memory.store }));
    const { id } = mutation.name === "field.create" ? mutation.args : { id: "" };
    const field = memory.fields.get(id);
    expect(field?.name).toBe("Mood");
    expect(field?.options.map((option) => option.label)).toEqual(["Calm", "Loud"]);
    expect(result.changes).toEqual([
      {
        entity: "field",
        id,
        op: "insert",
        data: { id, name: "Mood", type: "single_choice" as const, options: field?.options ?? [] },
      },
    ]);
  });

  test("every type can be defined, and only choice fields take options", async () => {
    const memory = memoryStore();
    for (const type of ["text", "number", "date", "yes_no", "multiple_choice"] as const) {
      // oxlint-disable-next-line no-await-in-loop
      applied(await runCommand(create(type, type), { principal: anna, store: memory.store }));
    }
    expect(memory.fields.size).toBe(5);
    const withOptions = await runCommand(create("Rating", "number", ["1"]), {
      principal: anna,
      store: memory.store,
    });
    expect(withOptions).toMatchObject({
      status: "failed",
      code: "validation_failed",
      problem: { detail: "Only choice fields have options." },
    });
    expect(memory.fields.size).toBe(5);
  });

  test("past 50 fields, another is refused, and the 50 stay", async () => {
    const memory = memoryStore({
      fields: Array.from({ length: maxFields }, (_, index) => stored(`Field ${index}`)),
    });
    const result = await runCommand(create("One more", "text"), {
      principal: anna,
      store: memory.store,
    });
    expect(result).toMatchObject({
      code: "limit_exceeded",
      problem: { detail: "You've reached 50 custom fields. Delete one to add another." },
    });
    expect(memory.fields.size).toBe(maxFields);
  });

  test("a name used by another type is refused, whatever its case", async () => {
    const memory = memoryStore({ fields: [stored("Rating")] });
    const result = await runCommand(create("rating", "single_choice"), {
      principal: anna,
      store: memory.store,
    });
    expect(result).toMatchObject({
      code: "name_conflict",
      problem: { detail: "'Rating' already exists. Choose another name." },
    });
    expect(memory.fields.size).toBe(1);
  });

  test("two options with one label, a blank label and a blank name are refused", async () => {
    const memory = memoryStore();
    const twice = await runCommand(create("Mood", "multiple_choice", ["Calm", "calm"]), {
      principal: anna,
      store: memory.store,
    });
    expect(twice).toMatchObject({
      code: "validation_failed",
      problem: { detail: "Each option needs its own label." },
    });
    const blankLabel = await runCommand(create("Mood", "single_choice", [" "]), {
      principal: anna,
      store: memory.store,
    });
    expect(blankLabel).toMatchObject({ problem: { detail: "Give each option a label." } });
    const blankName = await runCommand(create("  ", "text"), {
      principal: anna,
      store: memory.store,
    });
    expect(blankName).toMatchObject({ problem: { detail: "Give the field a name." } });
    const long = await runCommand(create("x".repeat(201), "text"), {
      principal: anna,
      store: memory.store,
    });
    expect(failed(long)).toBe("validation_failed");
    expect(memory.fields.size).toBe(0);
  });

  test("another account's name is free, and a read-only agent can't define fields", async () => {
    const memory = memoryStore({ fields: [stored("Rating", { ownerId: ben })] });
    applied(await runCommand(create("Rating", "number"), { principal: anna, store: memory.store }));
    expect(
      failed(
        await runCommand(create("Notes", "text"), { principal: readOnly, store: memory.store }),
      ),
    ).toBe("permission_denied");
  });

  test("a create sent again duplicates nothing; a different one with its ID is a conflict", async () => {
    const memory = memoryStore();
    const mutation = create("Mood", "single_choice", ["Calm"]);
    applied(await runCommand(mutation, { principal: anna, store: memory.store }));
    expect(
      await runCommand(
        { ...mutation, mutationId: uuidv7() },
        { principal: anna, store: memory.store },
      ),
    ).toEqual({ status: "applied", changes: [] });
    if (mutation.name !== "field.create") return;
    const other = { ...mutation, args: { ...mutation.args, name: "Feel" } };
    expect((await runCommand(other, { principal: anna, store: memory.store })).status).toBe(
      "conflict",
    );
    expect(
      failed(await runCommand(mutation, { principal: benPrincipal, store: memory.store })),
    ).toBe("validation_failed");
  });
});

describe("field.rename (FR-03.11, X-06)", () => {
  test("renames the definition and nothing else", async () => {
    const mood = stored("Mood", {
      type: "single_choice",
      options: [{ id: uuidv7(), label: "Calm" }],
    });
    const memory = memoryStore({ fields: [mood] });
    const result = applied(
      await runCommand(rename(mood.id, "Feel", "Mood"), { principal: anna, store: memory.store }),
    );
    expect(result.changes).toEqual([
      {
        entity: "field",
        id: mood.id,
        op: "update",
        data: { id: mood.id, name: "Feel", type: "single_choice", options: mood.options },
      },
    ]);
    expect(memory.fields.get(mood.id)).toMatchObject({ name: "Feel", options: mood.options });
  });

  test("a case-only rename keeps the new spelling; the same name changes nothing", async () => {
    const rating = stored("rating");
    const memory = memoryStore({ fields: [rating] });
    applied(
      await runCommand(rename(rating.id, "Rating", "rating"), {
        principal: anna,
        store: memory.store,
      }),
    );
    expect(memory.fields.get(rating.id)?.name).toBe("Rating");
    expect(
      await runCommand(rename(rating.id, "Rating", "Rating"), {
        principal: anna,
        store: memory.store,
      }),
    ).toEqual({ status: "applied", changes: [] });
  });

  test("a name another field has is refused", async () => {
    const rating = stored("Rating");
    const notes = stored("Notes", { type: "text" });
    const memory = memoryStore({ fields: [rating, notes] });
    expect(
      await runCommand(rename(notes.id, "RATING", "Notes"), {
        principal: anna,
        store: memory.store,
      }),
    ).toMatchObject({ code: "name_conflict" });
    expect(memory.fields.get(notes.id)?.name).toBe("Notes");
  });

  test("a rename over a name changed elsewhere is a conflict", async () => {
    const score = stored("Score");
    const memory = memoryStore({ fields: [score] });
    expect(
      await runCommand(rename(score.id, "Stars", "Rating"), {
        principal: anna,
        store: memory.store,
      }),
    ).toEqual({
      status: "conflict",
      conflicts: [{ field: "name", current: "Score", attempted: "Stars", base: "Rating" }],
    });
    expect(memory.fields.get(score.id)?.name).toBe("Score");
  });

  test("someone else's field and a missing one are refused", async () => {
    const theirs = stored("Rating", { ownerId: ben });
    const memory = memoryStore({ fields: [theirs] });
    expect(
      failed(
        await runCommand(rename(theirs.id, "Score", "Rating"), {
          principal: anna,
          store: memory.store,
        }),
      ),
    ).toBe("permission_denied");
    expect(
      failed(
        await runCommand(rename(uuidv7(), "Score", "Rating"), {
          principal: anna,
          store: memory.store,
        }),
      ),
    ).toBe("not_found");
  });
});

describe("option labels and limits (FR-03.14, X-06, TS-18)", () => {
  const options = [
    { id: "o1", label: "Vinyl" },
    { id: "o2", label: "CD" },
  ];

  test("a label collides with another option's, ignoring case, never with its own", () => {
    expect(optionLabelConflict("vinyl", options)).toEqual(options[0]);
    expect(optionLabelConflict("vinyl", options, "o1")).toBeUndefined();
    expect(optionLabelConflict("Cassette", options)).toBeUndefined();
  });

  test("the option limit is refused with its own words", () => {
    expect(optionLimitProblem()).toMatchObject({
      code: "limit_exceeded",
      problem: { detail: `A choice field can have at most ${maxFieldOptions} options.` },
    });
  });
});

const pathsOf = (problems: ReturnType<typeof fieldDefinitionProblems>) =>
  problems.map((problem) => problem.problem.errors?.[0]?.path);

describe("checking a new field before sending (FR-03.6, FR-03.9, FR-03.10)", () => {
  const fields = [{ id: "f1", name: "Rating" }];

  test("a good definition has no problems", () => {
    expect(
      fieldDefinitionProblems(" Format ", "single_choice", [{ id: "o1", label: "Vinyl" }], fields),
    ).toEqual([]);
  });

  test("each problem comes with its path and the server's words: the name, then each option", () => {
    const problems = fieldDefinitionProblems(
      "rating",
      "multiple_choice",
      [
        { id: "o1", label: "Vinyl" },
        { id: "o2", label: " " },
        { id: "o3", label: "vinyl" },
      ],
      fields,
    );
    expect(pathsOf(problems)).toEqual([
      "args.name",
      "args.options.1.label",
      "args.options.2.label",
    ]);
    expect(problems.map((problem) => problem.problem.detail)).toEqual([
      "'Rating' already exists. Choose another name.",
      "Give each option a label.",
      "Each option needs its own label.",
    ]);
  });

  test("only a choice field has options", () => {
    expect(
      pathsOf(fieldDefinitionProblems("Notes", "text", [{ id: "o1", label: "A" }], [])),
    ).toEqual(["args.options"]);
  });

  test("the field limit refuses only at the limit", () => {
    expect(fieldLimitProblem(maxFields - 1)).toBeUndefined();
    expect(fieldLimitProblem(maxFields)).toMatchObject({
      code: "limit_exceeded",
      problem: { detail: `You've reached ${maxFields} custom fields. Delete one to add another.` },
    });
  });
});
