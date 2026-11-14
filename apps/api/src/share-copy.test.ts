// Copying a share against the real app and a fresh test schema (FR-07.22, AC-51; TON-133): the preview counts what
// it adds, `share.copy` makes it the person's, with their album reused by its link, and the owner's share and the
// person's Shared with me stay as they were. Someone who can't open it gets nothing.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  bootstrapSchema,
  mutationResultSchema,
  shareCopyPreviewSchema,
  uuidv7,
  type Mutation,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let denis: { id: string; cookie: string };
let anna: { id: string; cookie: string };

beforeEach(async () => {
  t = await createTestApp();
  denis = await t.signIn("denis@example.com");
  anna = await t.signIn("anna@example.com");
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(mutation: Unsent, cookie: string) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie },
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`${mutation.name}: ${JSON.stringify(body)}`);
  return mutationResultSchema.parse(body).outcome;
}

const record = (title: string) => ({
  id: uuidv7(),
  title,
  artistCredit: "Sleep",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1999,
  recordingYearStart: null,
  recordingYearEnd: null,
});

async function bootstrap(cookie: string) {
  const response = await t.call("/v1/sync/bootstrap", { headers: { cookie } });
  return bootstrapSchema.parse(await response.json());
}

describe("copying a share (FR-07.22)", () => {
  test("the preview counts it, and the copy is the person's, with their own album reused", async () => {
    await send({ name: "account.setDisplayName", args: { displayName: "Denis" } }, denis.cookie);
    const metal = uuidv7();
    const doom = uuidv7();
    await send(
      {
        name: "container.create",
        args: { id: metal, kind: "folder", parentId: null, name: "Metal" },
      },
      denis.cookie,
    );
    await send(
      { name: "container.create", args: { id: doom, kind: "list", parentId: metal, name: "Doom" } },
      denis.cookie,
    );
    const [dopesmoker, holy] = [record("Dopesmoker"), record("Holy Mountain")];
    for (const each of [dopesmoker, holy]) {
      // oxlint-disable-next-line no-await-in-loop -- one album after another
      await send({ name: "album.create", args: { ...each, listId: doom } }, denis.cookie);
    }
    // Both have Dopesmoker by the same Spotify link, so Anna's is reused.
    const link = "https://open.spotify.com/album/4ShmFm3JsXuuANQJDFpj4Z";
    await send(
      {
        name: "link.set",
        args: { albumId: dopesmoker.id, service: "spotify", url: link },
        base: { url: null },
      },
      denis.cookie,
    );
    const annas = record("Dopesmoker");
    await send({ name: "album.create", args: annas }, anna.cookie);
    await send(
      {
        name: "link.set",
        args: { albumId: annas.id, service: "spotify", url: link },
        base: { url: null },
      },
      anna.cookie,
    );

    // Not shared yet: nothing to preview or copy.
    const before = await t.call(`/v1/shared/${metal}/copy?to=root`, {
      headers: { cookie: anna.cookie },
    });
    expect(before.status).toBe(404);

    const grantId = uuidv7();
    await send(
      { name: "share.invite", args: { grantId, containerId: metal, email: "anna@example.com" } },
      denis.cookie,
    );
    await send({ name: "share.accept", args: { grantId } }, anna.cookie);

    const preview = await t.call(`/v1/shared/${metal}/copy?to=root`, {
      headers: { cookie: anna.cookie },
    });
    expect(preview.status).toBe(200);
    expect(shareCopyPreviewSchema.parse(await preview.json())).toEqual({
      folders: 1,
      lists: 1,
      albums: 1,
      reused: 1,
      fields: 0,
      skippedFields: [],
      problems: [],
    });

    const copyId = uuidv7();
    expect(
      await send(
        { name: "share.copy", args: { containerId: metal, copyId, parentId: null, name: "Metal" } },
        anna.cookie,
      ),
    ).toMatchObject({ status: "confirmed", result: { containerId: copyId, albums: 1, reused: 1 } });

    const hers = await bootstrap(anna.cookie);
    const copied = hers.containers.find((each) => each.id === copyId);
    expect(copied).toMatchObject({ name: "Metal", kind: "folder", parentId: null });
    const list = hers.containers.find((each) => each.parentId === copyId);
    expect(list).toMatchObject({ name: "Doom", kind: "list" });
    const inList = hers.memberships.filter((entry) => entry.listId === list?.id);
    expect(inList.map((entry) => entry.albumId)).toContain(annas.id);
    expect(hers.albums.map((album) => album.title).toSorted()).toEqual([
      "Dopesmoker",
      "Holy Mountain",
    ]);
    // Her Shared with me keeps the share; his collection is as it was.
    expect(hers.references.map((reference) => reference.containerId)).toContain(metal);
    const his = await bootstrap(denis.cookie);
    expect(his.containers.map((each) => each.name).toSorted()).toEqual(["Doom", "Metal"]);
    expect(his.albums).toHaveLength(2);
  });
});
