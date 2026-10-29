// Opening shared content signed in (FR-07.11, FR-07.17, FR-05.2; DS-70; AC-16's shared part): a viewer reads a shared
// folder or list and nothing else; the stream says to read again after the owner saves, access ending included; and a
// viewer's sorting and arrangement are their own records, leaving the owner's views as they were.

import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  bootstrapSchema,
  mutationResultSchema,
  sharedSnapshotSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";

import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let base: string;
let denis: string;
let anna: string;
let ben: string;

beforeEach(async () => {
  t = await createTestApp();
  base = t.listen();
  ({ cookie: denis } = await t.signIn("denis@example.com"));
  ({ cookie: anna } = await t.signIn("anna@example.com"));
  ({ cookie: ben } = await t.signIn("ben@example.com"));
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

/** Denis's "Doom" with one album, shared with Anna, who accepted. */
async function sharedDoom() {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } }, denis);
  const doom = uuidv7();
  await send(
    { name: "container.create", args: { id: doom, kind: "list", parentId: null, name: "Doom" } },
    denis,
  );
  const grantId = uuidv7();
  await send(
    { name: "share.invite", args: { grantId, containerId: doom, email: "anna@example.com" } },
    denis,
  );
  await send({ name: "share.accept", args: { grantId } }, anna);
  return { doom, grantId };
}

const read = (id: string, as: string) => t.call(`/v1/shared/${id}`, { headers: { cookie: as } });

test("a viewer reads what's shared with them, and nothing else", async () => {
  const { doom } = await sharedDoom();
  const response = await read(doom, anna);
  expect(response.status).toBe(200);
  const snapshot = sharedSnapshotSchema.parse(await response.json());
  expect(snapshot).toMatchObject({ rootId: doom, owner: { displayName: "Denis" } });
  // Not Ben's, not even the owner's through this path, and nobody's without a session.
  expect((await read(doom, ben)).status).toBe(404);
  expect((await read(doom, denis)).status).toBe(404);
  expect((await t.call(`/v1/shared/${doom}`)).status).toBe(401);
});

test("the stream says to read again after the owner saves, and when access ends", async () => {
  const { doom, grantId } = await sharedDoom();
  expect(
    (await fetch(`${base}/v1/shared/${doom}/stream`, { headers: { cookie: ben } })).status,
  ).toBe(404);
  const controller = new AbortController();
  const response = await fetch(`${base}/v1/shared/${doom}/stream`, {
    headers: { cookie: anna },
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  let text = "";
  const reading = (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body ?? [])
        text += decoder.decode(chunk, { stream: true });
    } catch {
      // Aborted below.
    }
  })();
  const until = async (count: number) => {
    const deadline = performance.now() + 2_000;
    while (text.split("event: shared-invalidate").length - 1 < count) {
      if (performance.now() > deadline) throw new Error(`stream had ${text}`);
      // oxlint-disable-next-line no-await-in-loop
      await Bun.sleep(5);
    }
  };
  while (!text.includes(": open")) {
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(5);
  }
  await send(
    { name: "container.rename", args: { id: doom, name: "Doom Metal" }, base: { name: "Doom" } },
    denis,
  );
  await until(1);
  expect(text).toContain(`"rootId":"${doom}"`);
  await send({ name: "share.revoke", args: { grantId } }, denis);
  await until(2);
  expect((await read(doom, anna)).status).toBe(404);
  controller.abort();
  await reading;
});

/** The person's own synced state. */
const snapshotOf = async (as: string) =>
  bootstrapSchema.parse(
    await (await t.call("/v1/sync/bootstrap", { headers: { cookie: as } })).json(),
  );

test("a viewer's sort and order are their own; the owner's view stays as it was", async () => {
  const { doom } = await sharedDoom();
  const album = uuidv7();
  await send(
    {
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
    },
    denis,
  );
  await send({ name: "membership.add", args: { listId: doom, albumId: album } }, denis);
  expect(
    await send(
      {
        name: "view.set",
        args: { viewKey: doom, sortMode: "name", sortDir: "desc", layout: "grid" },
        base: { sortMode: null, sortDir: null, layout: null },
      },
      anna,
    ),
  ).toMatchObject({ status: "confirmed" });
  expect(
    await send(
      {
        name: "order.set",
        args: { viewKey: doom, keys: { [album]: "a0" } },
        base: { [album]: null },
      },
      anna,
    ),
  ).toMatchObject({ status: "confirmed" });
  const annas = await snapshotOf(anna);
  expect(annas.views).toEqual([
    { viewKey: doom, sortMode: "name", sortDir: "desc", grouped: null, layout: "grid" },
  ]);
  expect(annas.positions).toEqual([{ viewKey: doom, itemId: album, key: "a0" }]);
  const owners = await snapshotOf(denis);
  expect(owners.views).toEqual([]);
  expect(owners.positions).toEqual([]);
  // Someone the list isn't shared with can't keep a view of it.
  expect(
    await send(
      { name: "view.set", args: { viewKey: doom, layout: "grid" }, base: { layout: null } },
      ben,
    ),
  ).toMatchObject({ status: "failed", problem: { code: "not_found" } });
});
