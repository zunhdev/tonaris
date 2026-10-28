// Link edits through the API (FR-06.2, FR-06.3, TS-21, TS-40): the pasted link is read before the lock, stored
// canonical, and sent to the owner's sessions. Links are parsed for real; a short link's hops come from a stubbed
// fetcher, so nothing leaves the machine.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { readChanges } from "@tonaris/db";
import {
  batchResultSchema,
  bootstrapSchema,
  mutationResultSchema,
  uuidv7,
  type Bootstrap,
  type Mutation,
  type MutationResult,
} from "@tonaris/domain";
import { readLink, type Fetcher } from "@tonaris/providers";

import type { CaptureDeps } from "./capture";
import { createTestApp } from "./testing";

const bleach = "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv";
const shortLink = "https://spotify.link/AbCdEf";

/** Answers the short link with a redirect to Bleach's album page, as Spotify's short links do. */
const shortLinks: Fetcher = (url) =>
  Promise.resolve(
    url === shortLink
      ? new Response(null, { status: 301, headers: { location: `${bleach}?si=xyz` } })
      : new Response(null, { status: 404 }),
  );

const deps: CaptureDeps = {
  identify: () => Promise.reject(new Error("Not asked here")),
  describe: () => Promise.reject(new Error("Not asked here")),
  readLink: (input) => readLink(input, shortLinks),
};

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;
let accountId: string;

beforeEach(async () => {
  t = await createTestApp({ capture: deps });
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

async function bootstrap(): Promise<Bootstrap> {
  const response = await t.call("/v1/sync/bootstrap", { headers: { cookie } });
  return bootstrapSchema.parse(await response.json());
}

async function newAlbum(): Promise<string> {
  const id = uuidv7();
  const { outcome } = await send({
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
      artworkUrl: null,
    },
  });
  expect(outcome.status).toBe("confirmed");
  return id;
}

const set = (
  albumId: string,
  url: string,
  base: string | null,
  service: "spotify" | "tidal" = "spotify",
): Mutation => ({
  mutationId: uuidv7(),
  name: "link.set",
  args: { albumId, service, url },
  base: { url: base },
});

describe("link edits through the API (FR-06.2, FR-06.3)", () => {
  test("a pasted variant is stored canonical, and reaches the stream and the bootstrap", async () => {
    const albumId = await newAlbum();
    const mutation = set(
      albumId,
      "https://open.spotify.com/intl-de/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=abc",
      null,
    );
    expect((await send(mutation)).outcome.status).toBe("confirmed");
    expect((await bootstrap()).links).toEqual([{ albumId, service: "spotify", url: bleach }]);
    expect(await readChanges(t.db, accountId, 1, 10)).toEqual([
      expect.objectContaining({
        entity: "link",
        op: "insert",
        mutationId: mutation.mutationId,
        data: { albumId, service: "spotify", url: bleach },
      }),
    ]);
  });

  test("a short link is followed to its album's canonical URL", async () => {
    const albumId = await newAlbum();
    expect((await send(set(albumId, shortLink, null))).outcome.status).toBe("confirmed");
    expect((await bootstrap()).links).toEqual([{ albumId, service: "spotify", url: bleach }]);
  });

  test("another service's link and unsupported input are refused with their reasons", async () => {
    const albumId = await newAlbum();
    expect((await send(set(albumId, bleach, null, "tidal"))).outcome).toMatchObject({
      status: "failed",
      code: "unsupported_link",
      problem: { detail: "This is a Spotify link. Paste a Tidal link here." },
    });
    expect(
      (await send(set(albumId, "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", null)))
        .outcome,
    ).toMatchObject({
      status: "failed",
      code: "unsupported_link",
      problem: { detail: "Only Spotify album and track links can be added." },
    });
    expect((await bootstrap()).links).toEqual([]);
  });

  test("a link removed elsewhere makes a replacement a conflict, replayed on a resend", async () => {
    const albumId = await newAlbum();
    await send(set(albumId, bleach, null));
    await send({
      mutationId: uuidv7(),
      name: "link.remove",
      args: { albumId, service: "spotify" },
      base: { url: bleach },
    });
    const stale = set(albumId, "https://open.spotify.com/album/6jD6Wl5TgtrC8GJkplOtW9", bleach);
    const conflict = await send(stale);
    expect(conflict.outcome).toEqual({
      status: "conflict",
      conflicts: [
        {
          field: "url",
          current: null,
          attempted: "https://open.spotify.com/album/6jD6Wl5TgtrC8GJkplOtW9",
          base: bleach,
        },
      ],
    });
    expect(await send(stale)).toEqual(conflict);
    expect((await bootstrap()).links).toEqual([]);
  });

  test("a batch reads its items' links, and an album created in it can take one", async () => {
    const albumId = uuidv7();
    const create: Mutation = {
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
        artworkUrl: null,
      },
    };
    const link = set(albumId, shortLink, null);
    const response = await t.call("/v1/batches", {
      json: { batchId: uuidv7(), items: [create, { ...link, dependsOn: [create.mutationId] }] },
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const { items } = batchResultSchema.parse(await response.json());
    expect(items.map((item) => item.outcome.status)).toEqual(["confirmed", "confirmed"]);
    expect((await bootstrap()).links).toEqual([{ albumId, service: "spotify", url: bleach }]);
  });
});
