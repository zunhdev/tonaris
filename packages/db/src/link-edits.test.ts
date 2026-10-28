// Link edits against the local Postgres 18 (FR-06.2, FR-06.3, TS-11, TS-121): a link saved, replaced and deleted with
// its `entity_id`, under the owner's write lock, and the owner's links in the bootstrap snapshot.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  serviceLinkKey,
  uuidv7,
  type CapturedLink,
  type Mutation,
  type Principal,
} from "@tonaris/domain";

import { albums, albumServiceLinks, users } from "./schema";
import { findLinkedAlbum } from "./service-links";
import { bootstrapSnapshot, executeMutation } from "./sync";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const spotify = (id: string): CapturedLink => ({
  service: "spotify",
  url: `https://open.spotify.com/album/${id}`,
  entityId: id,
});
const bleachSpotify = spotify("1KQ1Pf4ikoK1jBbOtOHvOv");
const otherSpotify = spotify("6jD6Wl5TgtrC8GJkplOtW9");

async function newPrincipal(): Promise<Principal & { kind: "user" }> {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  return { kind: "user", userId, role: "user", client: "web" };
}

async function newAlbum(ownerId: string): Promise<string> {
  const id = uuidv7();
  await t.db.insert(albums).values({
    id,
    ownerId,
    title: "Bleach",
    artistCredit: "Nirvana",
    originalYear: 1989,
    searchTitleKey: "bleach",
    searchArtistKey: "nirvana",
  });
  return id;
}

const set = (albumId: string, link: CapturedLink, base: string | null): Mutation => ({
  mutationId: uuidv7(),
  name: "link.set",
  args: { albumId, service: link.service, url: link.url },
  base: { url: base },
});

const rows = (albumId: string) =>
  t.db
    .select({
      service: albumServiceLinks.service,
      url: albumServiceLinks.url,
      entityId: albumServiceLinks.entityId,
    })
    .from(albumServiceLinks)
    .where(eq(albumServiceLinks.albumId, albumId));

describe("link edits (FR-06.2, FR-06.3)", () => {
  test("a link is saved, replaced and deleted with its entity id, and logged for clients", async () => {
    const anna = await newPrincipal();
    const albumId = await newAlbum(anna.userId);

    const added = await executeMutation(t.db, anna, set(albumId, bleachSpotify, null), undefined, {
      link: { status: "parsed", link: bleachSpotify },
    });
    expect(added.result.outcome).toMatchObject({ status: "confirmed", seq: 1 });
    expect(added.changes).toEqual([
      {
        seq: 1,
        mutationId: added.result.mutationId,
        entity: "link",
        id: serviceLinkKey(albumId, "spotify"),
        op: "insert",
        data: { albumId, service: "spotify", url: bleachSpotify.url },
      },
    ]);
    expect(await rows(albumId)).toEqual([bleachSpotify]);
    expect(await findLinkedAlbum(t.db, anna.userId, "spotify", bleachSpotify.entityId)).toBe(
      albumId,
    );

    const replaced = await executeMutation(
      t.db,
      anna,
      set(albumId, otherSpotify, bleachSpotify.url),
      undefined,
      { link: { status: "parsed", link: otherSpotify } },
    );
    expect(replaced.changes.map((change) => change.op)).toEqual(["update"]);
    expect(await rows(albumId)).toEqual([otherSpotify]);
    // The replaced link no longer finds the album; the new one does.
    expect(
      await findLinkedAlbum(t.db, anna.userId, "spotify", bleachSpotify.entityId),
    ).toBeUndefined();

    const removed = await executeMutation(t.db, anna, {
      mutationId: uuidv7(),
      name: "link.remove",
      args: { albumId, service: "spotify" },
      base: { url: otherSpotify.url },
    });
    expect(removed.changes).toMatchObject([{ entity: "link", op: "delete", data: null }]);
    expect(await rows(albumId)).toEqual([]);
  });

  test("a refusal is stored and replayed without reading the link again", async () => {
    const anna = await newPrincipal();
    const albumId = await newAlbum(anna.userId);
    const mutation = set(albumId, bleachSpotify, null);
    const first = await executeMutation(t.db, anna, mutation, undefined, {
      link: {
        status: "failed",
        failure: {
          status: "failed",
          code: "provider_unavailable",
          problem: {
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            code: "provider_unavailable",
            detail: "Couldn't reach Spotify to open this short link. Try again.",
          },
        },
      },
    });
    expect(first.result.outcome).toMatchObject({ status: "failed", code: "provider_unavailable" });
    const again = await executeMutation(t.db, anna, mutation, undefined, {
      link: { status: "parsed", link: bleachSpotify },
    });
    expect(again.replayed).toBe(true);
    expect(again.result.outcome).toEqual(first.result.outcome);
    expect(await rows(albumId)).toEqual([]);
  });

  test("the bootstrap carries the owner's links, and only theirs", async () => {
    const anna = await newPrincipal();
    const ben = await newPrincipal();
    const annas = await newAlbum(anna.userId);
    const bens = await newAlbum(ben.userId);
    for (const [principal, albumId] of [
      [anna, annas],
      [ben, bens],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      await executeMutation(t.db, principal, set(albumId, bleachSpotify, null), undefined, {
        link: { status: "parsed", link: bleachSpotify },
      });
    }
    const snapshot = await bootstrapSnapshot(t.db, anna.userId);
    expect(snapshot.links).toEqual([
      { albumId: annas, service: "spotify", url: bleachSpotify.url },
    ]);
  });
});
