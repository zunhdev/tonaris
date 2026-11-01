// The MusicBrainz client on the Postgres cache (TS-41): answers outlive the client that fetched them, and the
// daily schedule prunes what expired. Against the local Postgres 18 (TS-121).

import { afterEach, beforeEach, expect, test } from "bun:test";

import { providerCache, providerCacheStore } from "@tonaris/db";
import { createTestDatabase, type TestDatabase } from "@tonaris/db/testing";
import { createSafeFetch, MusicBrainz, providerCacheMs } from "@tonaris/providers";

import { pruneProviderCacheSchedule, runSchedule } from "./jobs/schedules";

let t: TestDatabase;

beforeEach(async () => {
  t = await createTestDatabase();
});

afterEach(async () => {
  await t.drop();
});

const spotify = "https://open.spotify.com/album/32NZSslCL03dkXyILrrbGe";

/** A client on the test database whose MusicBrainz answers one linked URL, counting its requests. */
function client(now: () => number) {
  let requests = 0;
  const musicBrainz = new MusicBrainz({
    cache: providerCacheStore(t.db),
    now,
    sleep: async () => {},
    fetch: createSafeFetch({
      resolve: async () => [{ address: "93.184.215.14", family: 4 }],
      connect: async () => {
        requests += 1;
        return Response.json({
          urls: [
            {
              resource: spotify,
              relations: [
                {
                  "target-type": "release",
                  release: { id: "683dd246-f69a-42aa-9e39-4de5f0b88e34", title: "doing" },
                },
              ],
            },
          ],
        });
      },
    }),
  });
  return { musicBrainz, requests: () => requests };
}

test("answers kept in Postgres serve a client started later, without a request", async () => {
  const at = Date.UTC(2026, 9, 24, 12);
  const first = client(() => at);
  const answer = await first.musicBrainz.urls([spotify], { cacheMisses: true });
  const restarted = client(() => at + 60_000);
  expect(await restarted.musicBrainz.urls([spotify], { cacheMisses: true })).toEqual(answer);
  expect([first.requests(), restarted.requests()]).toEqual([1, 0]);
});

test("prune-provider-cache removes answers past their 7 days", async () => {
  const at = Date.UTC(2026, 9, 24, 12);
  await client(() => at).musicBrainz.urls([spotify], { cacheMisses: true });
  expect(await runSchedule(t.db, pruneProviderCacheSchedule, new Date(at + 60_000))).toBe(true);
  expect(await t.db.select().from(providerCache)).toHaveLength(1);
  await runSchedule(t.db, pruneProviderCacheSchedule, new Date(at + providerCacheMs + 1));
  expect(await t.db.select().from(providerCache)).toHaveLength(0);
});
