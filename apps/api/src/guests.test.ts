// A shared link through the API (FR-07.1, FR-07.11, FR-11.9; DS-72, TS-23, TS-32): its content without a session,
// with artwork signed; the same 404 for every way a link fails; a stream that says to read again after the owner
// saves anything, the display name included; and no token in the error log.

import { afterEach, beforeEach, expect, test } from "bun:test";

import {
  mutationResultSchema,
  sharedSnapshotSchema,
  shareSettingsSchema,
  unavailableLink,
  uuidv7,
  type Mutation,
} from "@tonaris/domain";

import { withoutShareToken } from "./problem";
import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let base: string;
let denis: string;

beforeEach(async () => {
  t = await createTestApp();
  base = t.listen();
  ({ cookie: denis } = await t.signIn("denis@example.com"));
});

afterEach(async () => {
  await t.drop();
});

type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

async function send(mutation: Unsent) {
  const response = await t.call("/v1/mutations", {
    json: { mutationId: uuidv7(), ...mutation },
    headers: { cookie: denis },
  });
  expect(mutationResultSchema.parse(await response.json()).outcome.status).toBe("confirmed");
}

/** "Doom" with "Nightfall" in it, shared by link. Answers the list's ID and the link's token. */
async function sharedDoom(): Promise<{ doom: string; token: string }> {
  await send({ name: "account.setDisplayName", args: { displayName: "Denis" } });
  const doom = uuidv7();
  await send({
    name: "container.create",
    args: { id: doom, kind: "list", parentId: null, name: "Doom" },
  });
  const nightfall = uuidv7();
  await send({
    name: "album.create",
    args: {
      id: nightfall,
      title: "Nightfall",
      artistCredit: "Candlemass",
      releaseType: "album",
      isLive: false,
      originalYear: 1987,
      recordingYearStart: null,
      recordingYearEnd: null,
    },
  });
  await send({
    name: "album.setArtwork",
    args: { id: nightfall, artworkUrl: "https://coverartarchive.org/release/x/front-500.jpg" },
    base: { artworkUrl: null },
  });
  await send({ name: "membership.add", args: { listId: doom, albumId: nightfall } });
  await send({
    name: "share.setLink",
    args: { containerId: doom, linkId: uuidv7(), enabled: true },
  });
  const settings = shareSettingsSchema.parse(
    await (await t.call(`/v1/containers/${doom}/sharing`, { headers: { cookie: denis } })).json(),
  );
  return { doom, token: settings.link?.url.split("/s/")[1] ?? "" };
}

const guest = (token: string) => t.call(`/v1/s/${token}`);

test("a link's content, without a session, with artwork signed", async () => {
  const { doom, token } = await sharedDoom();
  const response = await guest(token);
  expect(response.status).toBe(200);
  const snapshot = sharedSnapshotSchema.parse(await response.json());
  expect(snapshot.rootId).toBe(doom);
  expect(snapshot.owner).toEqual({ displayName: "Denis" });
  expect(snapshot.albums).toEqual([
    expect.objectContaining({ title: "Nightfall", artworkSignature: expect.any(String) }),
  ]);
});

test("unknown, turned-off and suspended links all answer the same 404", async () => {
  const { doom, token } = await sharedDoom();
  const unknown = await guest("A".repeat(43));
  expect(unknown.status).toBe(404);
  expect(await unknown.json()).toMatchObject({ code: "not_found", detail: unavailableLink });

  const unitId = uuidv7();
  await send({ name: "container.delete", args: { id: doom, unitId } });
  expect((await guest(token)).status).toBe(404);
  await send({ name: "trash.recover", args: { unitId } });
  expect((await guest(token)).status).toBe(200);

  await send({
    name: "share.setLink",
    args: { containerId: doom, linkId: uuidv7(), enabled: false },
  });
  expect((await guest(token)).status).toBe(404);
});

test("the stream says to read again after the owner's writes, the display name included", async () => {
  const { doom, token } = await sharedDoom();
  const controller = new AbortController();
  const response = await fetch(`${base}/v1/s/${token}/stream`, { signal: controller.signal });
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
  const invalidations = () => text.split("event: shared-invalidate").length - 1;
  const until = async (count: number) => {
    const deadline = performance.now() + 2_000;
    while (invalidations() < count) {
      if (performance.now() > deadline) throw new Error(`stream had ${text}`);
      // oxlint-disable-next-line no-await-in-loop
      await Bun.sleep(5);
    }
  };
  while (!text.includes(": open")) {
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(5);
  }

  await send({
    name: "container.rename",
    args: { id: doom, name: "Doom Metal" },
    base: { name: "Doom" },
  });
  await until(1);
  expect(text).toContain(`data: {"rootId":"${doom}"}`);
  await send({ name: "account.setDisplayName", args: { displayName: "Denis R." } });
  await until(2);
  controller.abort();
  await reading;
});

test("a link's token never reaches the error log", () => {
  const token = "A".repeat(43);
  expect(withoutShareToken(`/v1/s/${token}`)).toBe("/v1/s/[token]");
  expect(withoutShareToken(`/v1/s/${token}/stream`)).toBe("/v1/s/[token]/stream");
  expect(withoutShareToken("/v1/sync/stream")).toBe("/v1/sync/stream");
});
