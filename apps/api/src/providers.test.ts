// The API's providers (TS-41): the Spotify bridge only when configured, and its daily health check logging
// failures without Spotify values. Against the local Postgres 18, as schedules run in a transaction (TS-90).

import { afterEach, beforeEach, expect, test } from "bun:test";

import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { ProviderUnavailableError } from "@tonaris/providers";

import { createProviders } from "./providers";
import { apiSchedules, runSchedule, spotifyHealthAlbum, spotifyHealthSchedule } from "./schedules";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

test("the Spotify bridge and its health check exist only when configured", () => {
  const off = createProviders({ spotify: undefined }, t.db);
  expect(off.spotify).toBeUndefined();
  expect(apiSchedules(off.spotify).map((schedule) => schedule.name)).toEqual([
    "prune-sync-history",
    "prune-provider-cache",
  ]);
  const on = createProviders({ spotify: { clientId: "id", clientSecret: "secret" } }, t.db);
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
