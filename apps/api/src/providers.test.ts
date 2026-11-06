// The API's providers (TS-41): the Spotify bridge only when configured, and its daily health check logging
// failures without Spotify values. Against the local Postgres 18, as schedules run in a transaction.

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";

import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { ProviderUnavailableError } from "@tonaris/providers";

import {
  apiSchedules,
  runSchedule,
  spotifyHealthAlbum,
  spotifyHealthSchedule,
} from "./jobs/schedules";
import { createProviders } from "./providers";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

test("the Spotify bridge and its health check exist only when configured", () => {
  const off = createProviders({ spotify: undefined, youtubeApiKey: undefined }, t.db);
  expect(off.spotify).toBeUndefined();
  const trash = { db: t.db, publish: () => {} };
  expect(apiSchedules(off.spotify, trash).map((schedule) => schedule.name)).toEqual([
    "prune-sync-history",
    "prune-provider-cache",
    "prune-dead-jobs",
    "expire-admission-invitations",
    "prune-account-deletions",
    "trash-expiry",
  ]);
  const on = createProviders(
    { spotify: { clientId: "id", clientSecret: "secret" }, youtubeApiKey: "key" },
    t.db,
  );
  expect(apiSchedules(on.spotify, trash).map((schedule) => schedule.name)).toContain(
    "spotify-health",
  );
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

test("the API's spotify-health logs a failure as a JSON error line (TS-115)", async () => {
  const lines: unknown[] = [];
  const errors = spyOn(console, "error").mockImplementation((line: unknown) => {
    lines.push(line);
  });
  try {
    const spotify = { album: () => Promise.resolve({}) };
    const health = apiSchedules(spotify, { db: t.db, publish: () => {} }).find(
      (schedule) => schedule.name === "spotify-health",
    );
    if (!health) throw new Error("No spotify-health schedule");
    await runSchedule(t.db, health);
  } finally {
    errors.mockRestore();
  }
  expect(lines.map((line) => JSON.parse(String(line)))).toEqual([
    expect.objectContaining({
      level: "error",
      message:
        "Spotify health check failed: Get Album returned no UPC, so the bridge can't search barcodes.",
    }),
  ]);
});
