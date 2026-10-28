// A field's type and options against the local Postgres 18 (FR-03.12 to FR-03.17, X-09, TS-14, TS-121): a type change
// refused for an album in Trash, options added after the last key, a confirmed removal clearing single and multiple
// choices through the foreign keys, Trash included, and recovery bringing nothing back.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  uuidv7,
  type FieldType,
  type FieldValueData,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { readOptionRemoval } from "./field-options";
import { albumFieldMulti, albums, trashUnits, users } from "./schema";
import { bootstrapSnapshot, executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let anna: Principal & { kind: "user" };

beforeEach(async () => {
  t = await createTestDatabase();
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  anna = { kind: "user", userId, role: "user", client: "web" };
});

afterEach(async () => {
  await t.drop();
});

async function run(mutation: Mutation) {
  const { result, changes } = await executeMutation(t.db, anna, mutation);
  return { outcome: result.outcome, changes };
}

async function confirmed(mutation: Mutation) {
  const { outcome, changes } = await run(mutation);
  expect(outcome).toMatchObject({ status: "confirmed" });
  return changes;
}

async function newAlbum(title: string) {
  const id = uuidv7();
  await t.db.insert(albums).values({
    id,
    ownerId: anna.userId,
    title,
    artistCredit: "Nirvana",
    originalYear: 1989,
    searchTitleKey: title.toLowerCase(),
    searchArtistKey: "nirvana",
  });
  return id;
}

/** Moves the album to a Trash unit of its own, as deletion does (TS-13). */
async function trash(albumId: string) {
  const unitId = uuidv7();
  const deletedAt = new Date();
  await t.db.insert(trashUnits).values({
    id: unitId,
    ownerId: anna.userId,
    kind: "album",
    rootId: albumId,
    deletedAt,
    expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
  });
  await t.db
    .update(albums)
    .set({ trashedAt: deletedAt, trashUnitId: unitId })
    .where(eq(albums.id, albumId));
}

/** Recovers the album from Trash, as reactivation does: the album's own rows come back as they are. */
async function recover(albumId: string) {
  await t.db
    .update(albums)
    .set({ trashedAt: null, trashUnitId: null })
    .where(eq(albums.id, albumId));
}

async function defined(type: FieldType, labels: string[] = [], name: string = type) {
  const options = labels.map((label) => ({ id: uuidv7(), label }));
  const id = uuidv7();
  await confirmed({
    mutationId: uuidv7(),
    name: "field.create",
    args: { id, name, type, options },
  });
  return { id, options: options.map((option) => option.id) };
}

async function choose(albumId: string, fieldId: string, value: FieldValueData) {
  await confirmed({ mutationId: uuidv7(), name: "fieldValue.apply", args: { albumId, fieldId } });
  await confirmed({
    mutationId: uuidv7(),
    name: "fieldValue.set",
    args: { albumId, fieldId, value },
    base: { value: null },
  });
}

const valueOf = async (albumId: string, fieldId: string) =>
  (await bootstrapSnapshot(t.db, anna.userId)).fieldValues.find(
    (each) => each.albumId === albumId && each.fieldId === fieldId,
  )?.value;

describe("type changes in Postgres (FR-03.12, FR-03.13)", () => {
  test("an album in Trash applying the field, even empty, keeps its type", async () => {
    const rating = await defined("number");
    const albumId = await newAlbum("Bleach");
    await confirmed({
      mutationId: uuidv7(),
      name: "fieldValue.apply",
      args: { albumId, fieldId: rating.id },
    });
    await trash(albumId);
    const { outcome } = await run({
      mutationId: uuidv7(),
      name: "field.changeType",
      args: { id: rating.id, type: "text" },
      base: { type: "number" },
    });
    expect(outcome).toMatchObject({
      status: "failed",
      code: "field_in_use",
      problem: {
        detail: "Used by 1 album (1 in Trash). Create a new field of the type you need instead.",
      },
    });
  });

  test("a choice field becoming text loses its options, and gains none coming back", async () => {
    const mood = await defined("single_choice", ["Calm", "Loud"]);
    const { outcome } = await run({
      mutationId: uuidv7(),
      name: "field.changeType",
      args: { id: mood.id, type: "text" },
      base: { type: "single_choice" },
    });
    expect(outcome).toMatchObject({
      status: "confirmed",
      result: { discardedOptions: [{ label: "Calm" }, { label: "Loud" }] },
    });
    await confirmed({
      mutationId: uuidv7(),
      name: "field.changeType",
      args: { id: mood.id, type: "multiple_choice" },
      base: { type: "text" },
    });
    expect((await bootstrapSnapshot(t.db, anna.userId)).fields).toMatchObject([
      { id: mood.id, type: "multiple_choice", options: [] },
    ]);
  });
});

describe("options in Postgres (FR-03.14 to FR-03.17, X-09, TS-14)", () => {
  test("options are added after the last, renamed in place, and keep their selections", async () => {
    const mood = await defined("multiple_choice", ["Calm", "Loud"]);
    const [calm] = mood.options;
    const albumId = await newAlbum("Bleach");
    await choose(albumId, mood.id, [calm ?? ""]);
    const odd = uuidv7();
    await confirmed({
      mutationId: uuidv7(),
      name: "field.addOption",
      args: { fieldId: mood.id, id: odd, label: "Odd" },
    });
    await confirmed({
      mutationId: uuidv7(),
      name: "field.renameOption",
      args: { fieldId: mood.id, optionId: calm ?? "", label: "Quiet" },
      base: { label: "Calm" },
    });
    expect(
      (await bootstrapSnapshot(t.db, anna.userId)).fields[0]?.options.map((o) => o.label),
    ).toEqual(["Quiet", "Loud", "Odd"]);
    expect(await valueOf(albumId, mood.id)).toEqual([calm ?? ""]);
  });

  test("a confirmed removal clears the option everywhere, Trash included, and recovery brings nothing back", async () => {
    const mood = await defined("single_choice", ["Calm", "Loud"]);
    const tags = await defined("multiple_choice", ["Live", "Odd"]);
    const [calm] = mood.options;
    const [live, odd] = tags.options;
    const [bleach, nevermind] = [await newAlbum("Bleach"), await newAlbum("Nevermind")];
    await choose(bleach, mood.id, calm ?? null);
    await choose(nevermind, mood.id, calm ?? null);
    await choose(bleach, tags.id, [live ?? "", odd ?? ""]);
    await choose(nevermind, tags.id, [live ?? ""]);
    await trash(nevermind);

    const refused = await run({
      mutationId: uuidv7(),
      name: "field.removeOption",
      args: { fieldId: mood.id, optionId: calm ?? "" },
    });
    expect(refused.outcome).toMatchObject({
      status: "failed",
      code: "field_in_use",
      problem: {
        detail: "'Calm' is chosen on 2 albums (1 in Trash). Confirm removing it from them.",
      },
    });

    const removal = await readOptionRemoval(t.db, anna.userId, mood.id, calm ?? "");
    expect(removal).toMatchObject({ option: { label: "Calm" }, albums: 1, inTrash: 1 });
    const changes = await confirmed({
      mutationId: uuidv7(),
      name: "field.removeOption",
      args: { fieldId: mood.id, optionId: calm ?? "", scopeHash: removal?.scopeHash },
    });
    expect(changes.map((change) => change.entity)).toEqual(["field", "fieldValue", "fieldValue"]);
    expect(await valueOf(bleach, mood.id)).toBeNull();
    expect(await valueOf(nevermind, mood.id)).toBeNull();

    const tagsRemoval = await readOptionRemoval(t.db, anna.userId, tags.id, live ?? "");
    await confirmed({
      mutationId: uuidv7(),
      name: "field.removeOption",
      args: { fieldId: tags.id, optionId: live ?? "", scopeHash: tagsRemoval?.scopeHash },
    });
    expect(await valueOf(bleach, tags.id)).toEqual([odd ?? ""]);
    // Its last selection gone, the field stays applied and empty (FR-03.17).
    expect(await valueOf(nevermind, tags.id)).toBeNull();
    expect(
      await t.db
        .select()
        .from(albumFieldMulti)
        .where(eq(albumFieldMulti.optionId, live ?? "")),
    ).toEqual([]);

    await recover(nevermind);
    expect(await valueOf(nevermind, mood.id)).toBeNull();
    expect(await valueOf(nevermind, tags.id)).toBeNull();
    expect(
      (await bootstrapSnapshot(t.db, anna.userId)).fields.flatMap((f) =>
        f.options.map((o) => o.label),
      ),
    ).toEqual(["Loud", "Odd"]);
  });

  test("another account's option has no removal to read", async () => {
    const mood = await defined("single_choice", ["Calm"]);
    expect(await readOptionRemoval(t.db, uuidv7(), mood.id, mood.options[0] ?? "")).toBeUndefined();
    expect(await readOptionRemoval(t.db, anna.userId, mood.id, uuidv7())).toBeUndefined();
  });
});
