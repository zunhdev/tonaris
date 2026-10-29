// Shared content in search (FR-12.3, TS-50; AC-25's shared part): what an accepted invitation or a saved link shares is
// found, with its owner and a location from the shared root; a private ancestor is never matched or named, nor a
// private list of a shared album; pending invitations and unsaved links find nothing; and Trash, recovery, moves and
// revocation are followed.

import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  mutationResultSchema,
  searchResultsSchema,
  shareSettingsSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let denis: { id: string; cookie: string };
let anna: { id: string; cookie: string };
let ben: { id: string; cookie: string };

beforeEach(async () => {
  t = await createTestApp();
  denis = await t.signIn("denis@example.com");
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

async function send(mutation: Unsent, as = denis.cookie): Promise<MutationResult["outcome"]> {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: as },
  });
  const outcome = mutationResultSchema.parse(await response.json()).outcome;
  expect(outcome.status, JSON.stringify(outcome)).toBe("confirmed");
  return outcome;
}

const shared = async (q: string, as = anna.cookie) => {
  const response = await t.call(`/v1/search?q=${encodeURIComponent(q)}`, {
    headers: { cookie: as },
  });
  expect(response.status).toBe(200);
  return searchResultsSchema.parse(await response.json()).shared;
};

const create = (id: string, kind: "folder" | "list", name: string, parentId: string | null) =>
  send({ name: "container.create", args: { id, kind, parentId, name } });

/** Private › Metal (shared with Anna) › Doom, holding Nightfall, which is also in Denis's own list Secret. */
async function setup() {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } });
  const [secretFolder, metal, doom, secret, album] = [
    uuidv7(),
    uuidv7(),
    uuidv7(),
    uuidv7(),
    uuidv7(),
  ];
  await create(secretFolder, "folder", "Private", null);
  await create(metal, "folder", "Metal", secretFolder);
  await create(doom, "list", "Doom", metal);
  await create(secret, "list", "Secret", null);
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
  await send({ name: "membership.add", args: { listId: secret, albumId: album } });
  const grantId = uuidv7();
  await send({
    name: "share.invite",
    args: { grantId, containerId: metal, email: "anna@example.com" },
  });
  await send({ name: "share.accept", args: { grantId } }, anna.cookie);
  return { metal, doom, album, grantId };
}

test("an invitation's content is found from its shared root, never naming what's above it", async () => {
  const { metal, doom, album } = await setup();
  const owner = { id: denis.id, displayName: "Denis" };
  expect((await shared("doom")).lists).toEqual({
    total: 1,
    items: [
      {
        id: doom,
        kind: "list",
        name: "Doom",
        parentId: metal,
        location: ["Metal"],
        rootId: metal,
        owner,
      },
    ],
  });
  expect((await shared("metal")).folders.items).toEqual([
    {
      id: metal,
      kind: "folder",
      name: "Metal",
      parentId: null,
      location: [],
      rootId: metal,
      owner,
    },
  ]);
  // Its own lists only: not Denis's Secret.
  expect((await shared("nightfall")).albums.items).toEqual([
    expect.objectContaining({
      id: album,
      title: "Nightfall",
      owner,
      lists: [{ id: doom, location: ["Metal", "Doom"], rootId: metal }],
    }),
  ]);
  // Neither the private folder above nor the private list beside it.
  for (const found of await Promise.all(["private", "secret"].map((q) => shared(q)))) {
    expect([found.folders.total, found.lists.total, found.albums.total]).toEqual([0, 0, 0]);
  }
  // Denis's own search has none of it as shared.
  expect((await shared("doom", denis.cookie)).lists.total).toBe(0);
});

test("a pending invitation and an unsaved link find nothing; a saved link does", async () => {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } });
  const heavy = uuidv7();
  await create(heavy, "folder", "Heavy", null);
  await send({
    name: "share.invite",
    args: { grantId: uuidv7(), containerId: heavy, email: "ben@example.com" },
  });
  await send({
    name: "share.setLink",
    args: { containerId: heavy, linkId: uuidv7(), enabled: true },
  });
  expect((await shared("heavy", ben.cookie)).folders.total).toBe(0);
  expect((await shared("heavy")).folders.total).toBe(0);
  const settings = shareSettingsSchema.parse(
    await (
      await t.call(`/v1/containers/${heavy}/sharing`, { headers: { cookie: denis.cookie } })
    ).json(),
  );
  const token = settings.link?.url.split("/s/")[1] ?? "";
  await send({ name: "share.saveLink", args: { token } }, anna.cookie);
  expect((await shared("heavy")).folders.items).toEqual([
    expect.objectContaining({ id: heavy, rootId: heavy }),
  ]);
});

test("Trash, recovery, moves and revocation are followed", async () => {
  const { metal, doom, grantId } = await setup();
  const unitId = uuidv7();
  await send({ name: "container.delete", args: { id: doom, unitId } });
  expect((await shared("doom")).lists.total).toBe(0);
  await send({ name: "trash.recover", args: { unitId } });
  expect((await shared("doom")).lists.total).toBe(1);
  await send({
    name: "container.move",
    args: { id: doom, parentId: null },
    base: { parentId: metal },
  });
  expect((await shared("doom")).lists.total).toBe(0);
  await send({ name: "share.revoke", args: { grantId } });
  expect((await shared("metal")).folders.total).toBe(0);
});
