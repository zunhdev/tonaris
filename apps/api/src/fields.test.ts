// Removing a chosen option and deleting a field through the API (FR-03.17, FR-03.18, TS-14): each read gives the
// albums affected and the hash, which the mutation needs; another account's field or option is missing.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { albumFieldValues, albums, trashUnits } from "@tonaris/db";
import {
  bootstrapSchema,
  fieldDeletionSchema,
  fieldUsageListSchema,
  mutationResultSchema,
  optionRemovalSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;
let accountId: string;

beforeEach(async () => {
  t = await createTestApp();
  ({ id: accountId, cookie } = await t.signIn("anna@example.com"));
});

afterEach(async () => {
  await t.drop();
});

async function send(mutation: Mutation): Promise<MutationResult> {
  const response = await t.call("/v1/mutations", { json: mutation, headers: { cookie } });
  expect(response.status).toBe(200);
  return mutationResultSchema.parse(await response.json());
}

const removal = (fieldId: string, optionId: string, as = cookie) =>
  t.call(`/v1/fields/${fieldId}/options/${optionId}/removal`, { headers: { cookie: as } });

describe("removing a chosen option (FR-03.17, TS-14)", () => {
  test("the removal read gives the scope's hash, which confirms the removal", async () => {
    const [fieldId, calm, albumId] = [uuidv7(), uuidv7(), uuidv7()];
    await send({
      mutationId: uuidv7(),
      name: "field.create",
      args: {
        id: fieldId,
        name: "Mood",
        type: "single_choice",
        options: [{ id: calm, label: "Calm" }],
      },
    });
    await send({
      mutationId: uuidv7(),
      name: "album.create",
      args: {
        id: albumId,
        title: "Bleach",
        artistCredit: "Nirvana",
        releaseType: "album",
        isLive: false,
        originalYear: 1989,
        recordingYearStart: null,
        recordingYearEnd: null,
      },
    });
    await send({ mutationId: uuidv7(), name: "fieldValue.apply", args: { albumId, fieldId } });
    await send({
      mutationId: uuidv7(),
      name: "fieldValue.set",
      args: { albumId, fieldId, value: calm },
      base: { value: null },
    });

    const read = await removal(fieldId, calm);
    expect(read.status).toBe(200);
    const scope = optionRemovalSchema.parse(await read.json());
    expect(scope).toMatchObject({
      field: { id: fieldId, name: "Mood" },
      option: { id: calm, label: "Calm" },
      albums: 1,
      inTrash: 0,
    });

    const unconfirmed = await send({
      mutationId: uuidv7(),
      name: "field.removeOption",
      args: { fieldId, optionId: calm },
    });
    expect(unconfirmed.outcome).toMatchObject({ status: "failed", code: "field_in_use" });
    const removed = await send({
      mutationId: uuidv7(),
      name: "field.removeOption",
      args: { fieldId, optionId: calm, scopeHash: scope.scopeHash },
    });
    expect(removed.outcome.status).toBe("confirmed");
    const snapshot = bootstrapSchema.parse(
      await (await t.call("/v1/sync/bootstrap", { headers: { cookie } })).json(),
    );
    expect(snapshot.fields[0]?.options).toEqual([]);
    expect(snapshot.fieldValues).toEqual([{ albumId, fieldId, value: null }]);
  });

  test("another account's option, and a missing one, are not found", async () => {
    const [fieldId, calm] = [uuidv7(), uuidv7()];
    await send({
      mutationId: uuidv7(),
      name: "field.create",
      args: {
        id: fieldId,
        name: "Mood",
        type: "single_choice",
        options: [{ id: calm, label: "Calm" }],
      },
    });
    const ben = await t.signIn("ben@example.com");
    const theirs = await removal(fieldId, calm, ben.cookie);
    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toMatchObject({
      code: "not_found",
      detail: "This option doesn't exist.",
    });
    expect((await removal(fieldId, uuidv7())).status).toBe(404);
  });
});

describe("deleting a field (FR-03.18, TS-14)", () => {
  test("the deletion read gives the scope's hash, which the deletion needs", async () => {
    const fieldId = uuidv7();
    await send({
      mutationId: uuidv7(),
      name: "field.create",
      args: { id: fieldId, name: "Rating", type: "number", options: [] },
    });
    const read = await t.call(`/v1/fields/${fieldId}/deletion`, { headers: { cookie } });
    expect(read.status).toBe(200);
    const deletion = fieldDeletionSchema.parse(await read.json());
    expect(deletion).toMatchObject({
      field: { id: fieldId, name: "Rating", type: "number" },
      options: [],
      albums: 0,
      inTrash: 0,
    });
    const stale = await send({
      mutationId: uuidv7(),
      name: "field.delete",
      args: { id: fieldId, scopeHash: "0".repeat(64) },
    });
    expect(stale.outcome).toMatchObject({ status: "failed", code: "field_in_use" });
    const deleted = await send({
      mutationId: uuidv7(),
      name: "field.delete",
      args: { id: fieldId, scopeHash: deletion.scopeHash },
    });
    expect(deleted.outcome.status).toBe("confirmed");
    const ben = await t.signIn("ben@example.com");
    expect(
      (await t.call(`/v1/fields/${fieldId}/deletion`, { headers: { cookie: ben.cookie } })).status,
    ).toBe(404);
    expect((await t.call(`/v1/fields/${fieldId}/deletion`, { headers: { cookie } })).status).toBe(
      404,
    );
  });
});

describe("field usage (FR-03.12, DS-60)", () => {
  test("each field counts its albums, active and in Trash, and only the account's", async () => {
    const [rating, notes] = [uuidv7(), uuidv7()];
    for (const [id, name] of [
      [rating, "Rating"],
      [notes, "Notes"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await send({
        mutationId: uuidv7(),
        name: "field.create",
        args: { id, name, type: "number", options: [] },
      });
    }
    const albumIds = [uuidv7(), uuidv7()];
    for (const id of albumIds) {
      // oxlint-disable-next-line no-await-in-loop
      await send({
        mutationId: uuidv7(),
        name: "album.create",
        args: {
          id,
          title: "Bleach",
          artistCredit: "Nirvana",
          releaseType: "album",
          isLive: false,
          originalYear: 1989,
          recordingYearStart: null,
          recordingYearEnd: null,
        },
      });
      // oxlint-disable-next-line no-await-in-loop
      await send({
        mutationId: uuidv7(),
        name: "fieldValue.apply",
        args: { albumId: id, fieldId: rating },
      });
    }
    // An album in Trash, in a unit of its own (TS-13).
    const [trashed, unitId, deletedAt] = [uuidv7(), uuidv7(), new Date()];
    await t.db.insert(trashUnits).values({
      id: unitId,
      ownerId: accountId,
      kind: "album",
      rootId: trashed,
      deletedAt,
      expiresAt: new Date(deletedAt.getTime() + 30 * 86_400_000),
    });
    await t.db.insert(albums).values({
      id: trashed,
      ownerId: accountId,
      title: "Nevermind",
      artistCredit: "Nirvana",
      originalYear: 1991,
      searchTitleKey: "nevermind",
      searchArtistKey: "nirvana",
      trashedAt: deletedAt,
      trashUnitId: unitId,
    });
    await t.db.insert(albumFieldValues).values({ albumId: trashed, fieldId: rating });
    const response = await t.call("/v1/fields/usage", { headers: { cookie } });
    expect(response.status).toBe(200);
    const usage = fieldUsageListSchema.parse(await response.json());
    expect(usage.fields.toSorted((a, b) => b.albums - a.albums)).toEqual([
      { fieldId: rating, albums: 2, inTrash: 1 },
      { fieldId: notes, albums: 0, inTrash: 0 },
    ]);
    const ben = await t.signIn("ben@example.com");
    const theirs = await t.call("/v1/fields/usage", { headers: { cookie: ben.cookie } });
    expect(fieldUsageListSchema.parse(await theirs.json())).toEqual({ fields: [] });
  });
});
