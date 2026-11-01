// Find artwork's search (TON-112) on stubbed answers: MusicBrainz's release-group search, then the Cover Art
// Archive's fronts, on a simulated clock.

import { describe, expect, test } from "bun:test";

import { findCovers } from "./covers";
import { ProviderUnavailableError } from "./errors";
import { MusicBrainz } from "./musicbrainz";
import { memoryCache } from "./provider-cache";

const ids = {
  killEmAll: "f44f4f73-a714-31a1-a4b8-bfcaaf311f50",
  killEmAllForOne: "1d6b7a4e-6a4b-3f1c-9a63-4b2f8b3a3f21",
  noFront: "2e7c8b5f-7b5c-4a2d-8b74-5c3a9c4b4a32",
};

const group = (id: string, title: string, date: string, type: string | null) => ({
  id,
  title,
  "primary-type": type,
  "first-release-date": date,
  "artist-credit": [{ name: "Metallica" }],
});

/** MusicBrainz finds three albums by title and artist; the archive has fronts for two, or is down. */
function stubbed({ archiveDown = false, byArtist = true } = {}) {
  /** MusicBrainz's queries, with their limits. */
  const searches: { query: string; limit: string | null }[] = [];
  let clock = Date.UTC(2026, 9, 30, 12);
  const fetch = async (url: string, init: { method?: string }): Promise<Response> => {
    const { host, pathname, searchParams } = new URL(url);
    if (host === "musicbrainz.org") {
      const query = searchParams.get("query") ?? "";
      searches.push({ query, limit: searchParams.get("limit") });
      const found = byArtist || !query.includes("artist:");
      return Response.json({
        "release-groups": found
          ? [
              group(ids.killEmAll, "Kill ’Em All", "1983-07-25", "Album"),
              group(ids.killEmAllForOne, "Kill ’Em All for One", "1983", "EP"),
              group(ids.noFront, "Kill ’Em All (demo)", "", null),
            ]
          : [],
      });
    }
    if (archiveDown || init.method !== "HEAD") throw new Error("connection refused");
    const id = pathname.split("/")[2];
    return new Response(null, id === ids.noFront ? { status: 404 } : { status: 307 });
  };
  const musicBrainz = new MusicBrainz({
    cache: memoryCache(),
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  return { musicBrainz, searches };
}

const query = { title: "Kill 'Em All", artist: "Metallica" };

describe("findCovers (TON-112)", () => {
  test("albums with a front, in MusicBrainz's order, with their year and type", async () => {
    const { musicBrainz, searches } = stubbed();
    expect(await findCovers(musicBrainz, query)).toEqual([
      {
        releaseGroupId: ids.killEmAll,
        title: "Kill ’Em All",
        artistCredit: "Metallica",
        year: 1983,
        type: "Album",
        artworkUrl: `https://coverartarchive.org/release-group/${ids.killEmAll}/front-500`,
      },
      {
        releaseGroupId: ids.killEmAllForOne,
        title: "Kill ’Em All for One",
        artistCredit: "Metallica",
        year: 1983,
        type: "EP",
        artworkUrl: `https://coverartarchive.org/release-group/${ids.killEmAllForOne}/front-500`,
      },
    ]);
    expect(searches).toEqual([
      { query: `releasegroup:"Kill 'Em All" AND artist:"Metallica"`, limit: "8" },
    ]);
  });

  test("an artist spelled differently falls back to the title alone", async () => {
    const { musicBrainz, searches } = stubbed({ byArtist: false });
    expect(await findCovers(musicBrainz, query)).toHaveLength(2);
    expect(searches.map((search) => search.query)).toEqual([
      `releasegroup:"Kill 'Em All" AND artist:"Metallica"`,
      `releasegroup:"Kill 'Em All"`,
    ]);
  });

  test("an archive that can't be asked about any album is unavailable", async () => {
    const { musicBrainz } = stubbed({ archiveDown: true });
    const error = await findCovers(musicBrainz, query).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({ provider: "coverartarchive" });
  });
});
