// The API's providers (TS-41): the Spotify bridge only when configured, and its daily health check logging
// failures without Spotify values; enrichment published to the owner's sessions, or nothing written when
// MusicBrainz is busy (TS-42, TS-90). Against the local Postgres 18, as schedules run in a transaction.

import { afterEach, beforeEach, expect, test } from "bun:test";

import { executeMutation, users } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { uuidv7, type Album, type Change, type Principal } from "@tonaris/domain";
import { memoryCache, MusicBrainz, ProviderUnavailableError } from "@tonaris/providers";

import { createEnricher, createProviders } from "./providers";
import { apiSchedules, runSchedule, spotifyHealthAlbum, spotifyHealthSchedule } from "./schedules";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

test("the Spotify bridge and its health check exist only when configured", () => {
  const off = createProviders({ spotify: undefined }, t.db, { publish: () => {} });
  expect(off.spotify).toBeUndefined();
  expect(apiSchedules(off.spotify).map((schedule) => schedule.name)).toEqual([
    "prune-sync-history",
    "prune-provider-cache",
  ]);
  const on = createProviders({ spotify: { clientId: "id", clientSecret: "secret" } }, t.db, {
    publish: () => {},
  });
  expect(apiSchedules(on.spotify).map((schedule) => schedule.name)).toContain("spotify-health");
});

test("spotify-health logs a refused token and a missing UPC, naming no Spotify value", async () => {
  const logged: string[] = [];
  const log = (message: string) => logged.push(message);
  const asked: string[] = [];
  const check = (album: (id: string) => Promise<{ upc?: string } | undefined>) =>
    runSchedule(t.db, spotifyHealthSchedule({ album }, log));

  await check(async () => {
    throw new ProviderUnavailableError("spotify", "Spotify answered 400 to the token");
  });
  await check(async (id) => {
    asked.push(id);
    return {};
  });
  await check(async () => ({ upc: "886443927087" }));
  expect(logged).toEqual([
    "Spotify health check failed: Spotify answered 400 to the token.",
    "Spotify health check failed: Get Album returned no UPC, so the bridge can't search barcodes.",
  ]);
  expect(asked).toEqual([spotifyHealthAlbum]);
  expect(logged.join()).not.toContain("886443927087");
});

const bleachId = "f1afec0b-26dd-3db5-9aa1-c91229a74a24";

/** MusicBrainz answering *Bleach*, or busy throughout; the Cover Art Archive has its front. */
function musicBrainz(busy = false) {
  const asked: string[] = [];
  let clock = Date.UTC(2026, 9, 24, 12);
  const client = new MusicBrainz({
    cache: memoryCache(),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async (url) => {
      asked.push(url);
      if (url.startsWith("https://coverartarchive.org/"))
        return new Response(null, { status: 307 });
      if (busy) return new Response(null, { status: 503 });
      return Response.json({
        id: bleachId,
        title: "Bleach",
        "primary-type": "Album",
        "secondary-types": [],
        "first-release-date": "1989-08-08",
        "artist-credit": [{ name: "Nirvana", joinphrase: "" }],
        releases: [],
      });
    },
  });
  return { client, asked };
}

/** An owner's album, entered by hand and saved as *Bleach*'s release group, with no type yet. */
async function savedAlbum(releaseGroupId: string | null = bleachId) {
  const userId = uuidv7();
  await t.db.insert(users).values({ id: userId, email: `${userId}@example.com` });
  const principal: Principal = { kind: "user", userId, role: "user", client: "web" };
  const album: Album = {
    id: uuidv7(),
    title: "Bleach",
    artistCredit: "Nirvana",
    releaseType: null,
    isLive: false,
    originalYear: 1989,
    recordingYearStart: null,
    recordingYearEnd: null,
  };
  await executeMutation(t.db, principal, {
    mutationId: uuidv7(),
    name: "album.create",
    args: album,
  });
  // Capture will save the release group with the album (TON-44); until then, it is set directly.
  await t.db
    .$client`update albums set mb_release_group_id = ${releaseGroupId} where id = ${album.id}`;
  return { userId, album };
}

test("enrich fills a saved album's gaps and publishes the change to the owner's sessions", async () => {
  const { userId, album } = await savedAlbum();
  const published: [string, readonly Change[]][] = [];
  const enrich = createEnricher({
    db: t.db,
    musicBrainz: musicBrainz().client,
    hub: { publish: (accountId, changes) => published.push([accountId, changes]) },
  });
  expect(await enrich(userId, album.id)).toMatchObject({ status: "applied" });
  expect(published).toEqual([
    [
      userId,
      [
        expect.objectContaining({
          entity: "album",
          id: album.id,
          data: { ...album, releaseType: "album" },
          mutationId: null,
        }),
      ],
    ],
  ]);
});

test("enrich writes and publishes nothing while MusicBrainz stays busy", async () => {
  const { userId, album } = await savedAlbum();
  const published: unknown[] = [];
  const enrich = createEnricher({
    db: t.db,
    musicBrainz: musicBrainz(true).client,
    hub: { publish: (...args) => published.push(args) },
  });
  const error = await enrich(userId, album.id).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ProviderUnavailableError);
  const [row] = await t.db.$client`select release_type from albums where id = ${album.id}`;
  expect(row?.release_type).toBeNull();
  expect(published).toEqual([]);
});

test("enrich asks nothing for an album with no release group, or one the account doesn't have", async () => {
  const { userId, album } = await savedAlbum(null);
  const { client, asked } = musicBrainz();
  const enrich = createEnricher({ db: t.db, musicBrainz: client, hub: { publish: () => {} } });
  expect(await enrich(userId, album.id)).toBeUndefined();
  expect(await enrich(userId, uuidv7())).toMatchObject({ status: "failed", code: "not_found" });
  expect(asked).toEqual([]);
});
