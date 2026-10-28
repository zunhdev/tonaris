// Custom fields on albums against the local Postgres 18 (FR-03.7, FR-03.8, FR-03.10, TS-11, TS-121): each type stored
// in its column and read back, a multiple choice in its options' order, applied-empty apart from unused, removal taking
// the selections with it, and the bootstrap.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  uuidv7,
  type FieldType,
  type FieldValueData,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { albumFieldMulti, albumFieldValues, albums, users } from "./schema";
import { bootstrapSnapshot, executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let anna: Principal & { kind: "user" };
let albumId: string;

beforeEach(async () => {
  t = await createTestDatabase();
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  anna = { kind: "user", userId, role: "user", client: "web" };
  albumId = uuidv7();
  await t.db.insert(albums).values({
    id: albumId,
    ownerId: userId,
    title: "Bleach",
    artistCredit: "Nirvana",
    originalYear: 1989,
    searchTitleKey: "bleach",
    searchArtistKey: "nirvana",
  });
});

afterEach(async () => {
  await t.drop();
});

async function run(mutation: Mutation) {
  const { result } = await executeMutation(t.db, anna, mutation);
  expect(result.outcome.status).toBe("confirmed");
}

async function defined(type: FieldType, labels: string[] = []) {
  const options = labels.map((label) => ({ id: uuidv7(), label }));
  const id = uuidv7();
  await run({
    mutationId: uuidv7(),
    name: "field.create",
    args: { id, name: type, type, options },
  });
  return { id, options: options.map((option) => option.id) };
}

const apply = (fieldId: string): Mutation => ({
  mutationId: uuidv7(),
  name: "fieldValue.apply",
  args: { albumId, fieldId },
});
const set = (fieldId: string, value: FieldValueData, base: FieldValueData = null): Mutation => ({
  mutationId: uuidv7(),
  name: "fieldValue.set",
  args: { albumId, fieldId, value },
  base: { value: base },
});

const valuesNow = async () => (await bootstrapSnapshot(t.db, anna.userId)).fieldValues;

describe("field values in Postgres (FR-03.7, FR-03.10)", () => {
  test("each type is stored in its column and read back as set", async () => {
    const pick = await defined("single_choice", ["One", "Two"]);
    const cases: [FieldType, FieldValueData][] = [
      ["text", "Loud"],
      ["number", "4.50"],
      ["date", "2024-02-29"],
      ["yes_no", false],
    ];
    const ids: Record<string, string> = {};
    for (const [type, value] of cases) {
      // oxlint-disable-next-line no-await-in-loop
      const { id } = await defined(type);
      ids[type] = id;
      // oxlint-disable-next-line no-await-in-loop
      await run(apply(id));
      // oxlint-disable-next-line no-await-in-loop
      await run(set(id, value));
    }
    await run(apply(pick.id));
    await run(set(pick.id, pick.options[1] ?? null));
    const values = await valuesNow();
    for (const [type, value] of cases) {
      expect(values.find((each) => each.fieldId === ids[type])?.value).toEqual(value);
    }
    expect(values.find((each) => each.fieldId === pick.id)?.value).toBe(pick.options[1]);
    const [row] = await t.db
      .select({ numberValue: albumFieldValues.numberValue })
      .from(albumFieldValues)
      .where(eq(albumFieldValues.fieldId, ids.number ?? ""));
    expect(row?.numberValue).toBe("4.50");
  });

  test("applied-empty is a row without a value; unused is no row", async () => {
    const rating = await defined("number");
    expect(await valuesNow()).toEqual([]);
    await run(apply(rating.id));
    expect(await valuesNow()).toEqual([{ albumId, fieldId: rating.id, value: null }]);
  });

  test("a multiple choice reads in its options' order, and removal takes its selections", async () => {
    const mood = await defined("multiple_choice", ["Calm", "Loud", "Odd"]);
    const [calm, , odd] = mood.options;
    await run(apply(mood.id));
    await run(set(mood.id, [odd ?? "", calm ?? ""]));
    expect(await valuesNow()).toEqual([
      { albumId, fieldId: mood.id, value: [calm ?? "", odd ?? ""] },
    ]);
    await run({
      mutationId: uuidv7(),
      name: "fieldValue.remove",
      args: { albumId, fieldId: mood.id },
    });
    expect(await valuesNow()).toEqual([]);
    expect(await t.db.select().from(albumFieldMulti)).toEqual([]);
    // Applied again, it starts empty (FR-03.8).
    await run(apply(mood.id));
    expect(await valuesNow()).toEqual([{ albumId, fieldId: mood.id, value: null }]);
  });
});
