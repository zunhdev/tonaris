// Deleting a custom field against the local Postgres 18 (FR-03.18, X-09, TS-14, TS-121): the read's hash confirming
// the deletion, the cascade removing every album's usage and selections, in Trash too, and recovery bringing nothing
// back.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { uuidv7, type FieldValueData, type Mutation, type Principal } from "@tonaris/domain";

import { readFieldDeletion } from "./field-options";
import {
  albumFieldMulti,
  albumFieldValues,
  albums,
  fieldOptions,
  trashUnits,
  users,
} from "./schema";
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

async function confirmed(mutation: Mutation) {
  const { result, changes } = await executeMutation(t.db, anna, mutation);
  expect(result.outcome).toMatchObject({ status: "confirmed" });
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

async function choose(albumId: string, fieldId: string, value: FieldValueData) {
  await confirmed({ mutationId: uuidv7(), name: "fieldValue.apply", args: { albumId, fieldId } });
  await confirmed({
    mutationId: uuidv7(),
    name: "fieldValue.set",
    args: { albumId, fieldId, value },
    base: { value: null },
  });
}

describe("deleting a field in Postgres (FR-03.18, X-09)", () => {
  test("a confirmed deletion takes every album's usage, in Trash too, and recovery brings nothing back", async () => {
    const [fieldId, calm, odd] = [uuidv7(), uuidv7(), uuidv7()];
    await confirmed({
      mutationId: uuidv7(),
      name: "field.create",
      args: {
        id: fieldId,
        name: "Mood",
        type: "multiple_choice",
        options: [
          { id: calm, label: "Calm" },
          { id: odd, label: "Odd" },
        ],
      },
    });
    const [bleach, nevermind] = [await newAlbum("Bleach"), await newAlbum("Nevermind")];
    await choose(bleach, fieldId, [calm, odd]);
    await choose(nevermind, fieldId, [odd]);
    await trash(nevermind);

    const deletion = await readFieldDeletion(t.db, anna.userId, fieldId);
    expect(deletion).toMatchObject({
      field: { id: fieldId, name: "Mood", type: "multiple_choice" },
      options: [{ label: "Calm" }, { label: "Odd" }],
      albums: 1,
      inTrash: 1,
    });
    const changes = await confirmed({
      mutationId: uuidv7(),
      name: "field.delete",
      args: { id: fieldId, scopeHash: deletion?.scopeHash ?? "" },
    });
    expect(changes.map((change) => [change.entity, change.op])).toEqual([
      ["field", "delete"],
      ["fieldValue", "delete"],
      ["fieldValue", "delete"],
    ]);
    expect(await t.db.select().from(fieldOptions).where(eq(fieldOptions.fieldId, fieldId))).toEqual(
      [],
    );
    expect(await t.db.select().from(albumFieldValues)).toEqual([]);
    expect(await t.db.select().from(albumFieldMulti)).toEqual([]);

    // Recovered from Trash, the album comes back without the field (X-09).
    await t.db
      .update(albums)
      .set({ trashedAt: null, trashUnitId: null })
      .where(eq(albums.id, nevermind));
    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    expect(snapshot.fields).toEqual([]);
    expect(snapshot.fieldValues).toEqual([]);
  });

  test("another account's field has no deletion to read", async () => {
    const fieldId = uuidv7();
    await confirmed({
      mutationId: uuidv7(),
      name: "field.create",
      args: { id: fieldId, name: "Rating", type: "number", options: [] },
    });
    expect(await readFieldDeletion(t.db, uuidv7(), fieldId)).toBeUndefined();
    expect(await readFieldDeletion(t.db, anna.userId, uuidv7())).toBeUndefined();
  });
});
