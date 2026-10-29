// Previewing a move's or a recovery's sharing consequences through the API (FR-07.9, FR-07.10, FR-07.14; DS-69): what
// a move between shared folders adds and removes, what a folder's or list's recovery and an album's would show to
// whom, and someone else's item or an impossible destination refused.

import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  mutationResultSchema,
  sharingImpactSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let denis: string;
let anna: { id: string; cookie: string };
let ben: { id: string; cookie: string };

beforeEach(async () => {
  t = await createTestApp();
  ({ cookie: denis } = await t.signIn("denis@example.com"));
  anna = await t.signIn("anna@example.com");
  ben = await t.signIn("ben@example.com");
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(mutation: Unsent, as = denis): Promise<MutationResult["outcome"]> {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: as },
  });
  const outcome = mutationResultSchema.parse(await response.json()).outcome;
  expect(outcome.status, JSON.stringify(outcome)).toBe("confirmed");
  return outcome;
}

const preview = (query: string, as = denis) =>
  t.call(`/v1/sharing/impact?${query}`, { headers: { cookie: as } });
const impactOf = async (query: string) => {
  const response = await preview(query);
  expect(response.status).toBe(200);
  return sharingImpactSchema.parse(await response.json());
};

/** Metal, shared with Anna, holding the list Doom, invited to Ben (pending); Heavy, with a link. */
async function setup() {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } });
  await send({ name: "account.setDisplayName", args: { displayName: "Anna" } }, anna.cookie);
  const [metal, heavy, doom] = [uuidv7(), uuidv7(), uuidv7()];
  const create = (id: string, kind: "folder" | "list", name: string, parentId: string | null) =>
    send({ name: "container.create", args: { id, kind, parentId, name } });
  await create(metal, "folder", "Metal", null);
  await create(heavy, "folder", "Heavy", null);
  await create(doom, "list", "Doom", metal);
  const grantId = uuidv7();
  await send({
    name: "share.invite",
    args: { grantId, containerId: metal, email: "anna@example.com" },
  });
  await send({ name: "share.accept", args: { grantId } }, anna.cookie);
  await send({
    name: "share.invite",
    args: { grantId: uuidv7(), containerId: doom, email: "Ben@Example.com" },
  });
  await send({
    name: "share.setLink",
    args: { containerId: heavy, linkId: uuidv7(), enabled: true },
  });
  return { metal, heavy, doom };
}

test("a move between shared folders adds and removes their audiences, keeping its own", async () => {
  const { metal, heavy, doom } = await setup();
  expect(await impactOf(`move=${doom}&to=${heavy}`)).toEqual({
    added: [{ kind: "link", via: { id: heavy, name: "Heavy" } }],
    removed: [
      {
        kind: "person",
        id: anna.id,
        name: "Anna",
        pending: false,
        via: { id: metal, name: "Metal" },
      },
    ],
    direct: [
      {
        kind: "person",
        id: ben.id,
        name: "Ben@Example.com",
        pending: true,
        via: { id: doom, name: "Doom" },
      },
    ],
  });
  expect(await impactOf(`move=${heavy}&to=${metal}`)).toMatchObject({
    added: [{ kind: "person", name: "Anna" }],
    removed: [],
  });
  // Into itself, into a list, or someone else's: no.
  expect((await preview(`move=${metal}&to=${metal}`)).status).toBe(422);
  expect((await preview(`move=${heavy}&to=${doom}`)).status).toBe(422);
  expect((await preview(`move=${doom}&to=root`, ben.cookie)).status).toBe(404);
  expect((await preview(`move=${doom}`)).status).toBe(422);
});

test("recovery shows the destination's audiences and the shares that resume", async () => {
  const { metal, heavy, doom } = await setup();
  const album = uuidv7();
  await send({
    name: "album.create",
    args: {
      id: album,
      title: "Nightfall",
      artistCredit: "Candlemass",
      releaseType: "album",
      isLive: false,
      originalYear: 1987,
      recordingYearStart: null,
      recordingYearEnd: null,
    },
  });
  await send({ name: "membership.add", args: { listId: doom, albumId: album } });
  const albumUnit = uuidv7();
  await send({ name: "album.delete", args: { id: album, unitId: albumUnit } });
  expect(await impactOf(`recover=${albumUnit}`)).toMatchObject({
    added: [
      { kind: "person", name: "Ben@Example.com", pending: true },
      { kind: "person", name: "Anna", via: { id: metal } },
    ],
  });

  const unitId = uuidv7();
  await send({ name: "container.delete", args: { id: doom, unitId } });
  // Where it was: Metal, Anna's.
  expect(await impactOf(`recover=${unitId}`)).toMatchObject({
    added: [{ kind: "person", name: "Anna" }],
    direct: [{ kind: "person", name: "Ben@Example.com" }],
  });
  expect(await impactOf(`recover=${unitId}&to=${heavy}`)).toMatchObject({
    added: [{ kind: "link", via: { id: heavy } }],
  });
  expect((await preview(`recover=${unitId}`, ben.cookie)).status).toBe(404);
});
