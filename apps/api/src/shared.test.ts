// Shared with me through the API (FR-07.13; DS-67, DS-68; AC-24): saving a link adds one reference and copies nothing;
// opening a link adds nothing; references reach the bootstrap and the stream; an entry that stops working is listed
// without its name and can still be removed; and a visitor's link state.

import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  bootstrapSchema,
  linkReferenceStateSchema,
  mutationResultSchema,
  sharedWithMeSchema,
  shareSettingsSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let denis: string;
let anna: string;

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie: denis } = await t.signIn("denis@example.com"));
  ({ cookie: anna } = await t.signIn("anna@example.com"));
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(mutation: Unsent, as: string): Promise<MutationResult["outcome"]> {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: as },
  });
  return mutationResultSchema.parse(await response.json()).outcome;
}

const shared = async (as: string) =>
  sharedWithMeSchema.parse(await (await t.call("/v1/shared", { headers: { cookie: as } })).json())
    .entries;

async function linkedDoom(): Promise<{ doom: string; token: string }> {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } }, denis);
  const doom = uuidv7();
  await send(
    { name: "container.create", args: { id: doom, kind: "list", parentId: null, name: "Doom" } },
    denis,
  );
  await send(
    { name: "share.setLink", args: { containerId: doom, linkId: uuidv7(), enabled: true } },
    denis,
  );
  const settings = shareSettingsSchema.parse(
    await (await t.call(`/v1/containers/${doom}/sharing`, { headers: { cookie: denis } })).json(),
  );
  return { doom, token: settings.link?.url.split("/s/")[1] ?? "" };
}

const state = async (token: string, as?: string) => {
  const response = await t.call(`/v1/s/${token}/reference`, as ? { headers: { cookie: as } } : {});
  return {
    status: response.status,
    body: response.ok ? linkReferenceStateSchema.parse(await response.json()) : undefined,
  };
};

test("saving a link keeps it once, copying nothing; opening it alone adds nothing", async () => {
  const { doom, token } = await linkedDoom();
  expect((await t.call(`/v1/s/${token}`)).status).toBe(200);
  expect(await shared(anna)).toEqual([]);
  expect((await state(token, anna)).body).toEqual({ saved: false, own: false });
  expect((await state(token, denis)).body).toEqual({ saved: false, own: true });
  expect((await state(token)).status).toBe(401);

  expect(await send({ name: "share.saveLink", args: { token } }, anna)).toMatchObject({
    status: "confirmed",
  });
  expect(await send({ name: "share.saveLink", args: { token } }, anna)).toMatchObject({
    status: "confirmed",
  });
  expect(await shared(anna)).toEqual([
    {
      containerId: doom,
      owner: { id: expect.any(String), displayName: "Denis" },
      name: "Doom",
      kind: "list",
      via: { invitation: false, link: true },
      available: true,
    },
  ]);
  expect((await state(token, anna)).body).toEqual({ saved: true, own: false });
  const snapshot = bootstrapSchema.parse(
    await (await t.call("/v1/sync/bootstrap", { headers: { cookie: anna } })).json(),
  );
  expect(snapshot.references).toEqual([{ containerId: doom }]);
  expect(snapshot.albums).toEqual([]);
  expect(snapshot.containers).toEqual([]);
});

test("an entry that stops working loses its name, and can still be removed", async () => {
  const { doom, token } = await linkedDoom();
  await send({ name: "share.saveLink", args: { token } }, anna);
  await send(
    { name: "container.rename", args: { id: doom, name: "Secret" }, base: { name: "Doom" } },
    denis,
  );
  await send(
    { name: "share.setLink", args: { containerId: doom, linkId: uuidv7(), enabled: false } },
    denis,
  );
  expect(await shared(anna)).toEqual([
    expect.objectContaining({
      name: null,
      kind: null,
      available: false,
      via: { invitation: false, link: false },
    }),
  ]);
  expect(
    await send({ name: "share.removeReference", args: { containerId: doom } }, anna),
  ).toMatchObject({ status: "confirmed" });
  expect(await shared(anna)).toEqual([]);
});

test("an accepted invitation is listed as such", async () => {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } }, denis);
  const metal = uuidv7();
  await send(
    {
      name: "container.create",
      args: { id: metal, kind: "folder", parentId: null, name: "Metal" },
    },
    denis,
  );
  const grantId = uuidv7();
  await send(
    { name: "share.invite", args: { grantId, containerId: metal, email: "anna@example.com" } },
    denis,
  );
  await send({ name: "share.accept", args: { grantId } }, anna);
  expect(await shared(anna)).toEqual([
    expect.objectContaining({
      name: "Metal",
      kind: "folder",
      via: { invitation: true, link: false },
      available: true,
    }),
  ]);
});
