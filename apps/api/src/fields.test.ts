// Removing a chosen option through the API (FR-03.17, TS-14): the removal read gives the albums choosing it and the
// hash; `field.removeOption` refuses without it and accepts it; another account's option is missing.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  bootstrapSchema,
  mutationResultSchema,
  optionRemovalSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie } = await t.signIn("anna@example.com"));
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
