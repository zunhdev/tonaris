// The Postgres cache behind the MusicBrainz client (TS-41), against the local Postgres 18 (TS-121).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { providerCacheStore, pruneProviderCache } from "./provider-cache";
import { providerCache } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const now = new Date("2026-10-24T12:00:00Z");
const inAWeek = new Date("2026-10-31T12:00:00Z");

describe("providerCacheStore", () => {
  test("keeps JSON values until they expire", async () => {
    const cache = providerCacheStore(t.db);
    const targets = { targets: [{ kind: "release", id: "683dd246", title: "doing" }] };
    await cache.set(
      [
        { key: "musicbrainz:url:https://open.spotify.com/album/x", value: targets },
        { key: "musicbrainz:barcode:886443927087", value: { releases: [] } },
      ],
      inAWeek,
    );
    expect(
      await cache.get(
        ["musicbrainz:url:https://open.spotify.com/album/x", "musicbrainz:barcode:0", "x"],
        now,
      ),
    ).toEqual(new Map([["musicbrainz:url:https://open.spotify.com/album/x", targets]]));
    expect(await cache.get(["musicbrainz:barcode:886443927087"], inAWeek)).toEqual(new Map());
    expect(await cache.get([], now)).toEqual(new Map());
  });

  test("a key kept again is replaced, value and expiry", async () => {
    const cache = providerCacheStore(t.db);
    const key = "musicbrainz:release-group:aa997ea0:";
    await cache.set([{ key, value: { body: null } }], now);
    await cache.set(
      [
        { key, value: { body: { id: "first" } } },
        { key, value: { body: { id: "aa997ea0" } } },
      ],
      inAWeek,
    );
    expect(await cache.get([key], now)).toEqual(new Map([[key, { body: { id: "aa997ea0" } }]]));
    expect(await t.db.select().from(providerCache)).toHaveLength(1);
  });
});

describe("pruneProviderCache", () => {
  test("removes what expired, and keeps the rest", async () => {
    const cache = providerCacheStore(t.db);
    await cache.set([{ key: "old", value: {} }], now);
    await cache.set([{ key: "fresh", value: {} }], inAWeek);
    await pruneProviderCache(t.db, now);
    expect((await t.db.select().from(providerCache)).map((row) => row.key)).toEqual(["fresh"]);
  });
});
