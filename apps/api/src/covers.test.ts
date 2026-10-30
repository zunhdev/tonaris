// `GET /v1/artwork/covers` (TON-112, FR-03.4): covers for a title and an artist, signed so the image proxy shows them
// (TS-103); a session is required, and a source that can't be asked answers 503.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { artworkPath, coversSchema, problemSchema } from "@tonaris/domain";

import { fixtureCovers, fixtureImageFetch } from "./capture-fixtures";
import { createTestApp } from "./testing";

let t: Awaited<ReturnType<typeof createTestApp>>;
let cookie: string;

beforeEach(async () => {
  t = await createTestApp({ covers: fixtureCovers, imageFetch: fixtureImageFetch });
  ({ cookie } = await t.signIn("anna@example.com"));
});

afterEach(async () => {
  await t.drop();
});

/** Asks for covers, signed in unless `as` is null. */
const covers = (title: string, artist: string, as: string | null = cookie) =>
  t.call(`/v1/artwork/covers?${new URLSearchParams({ title, artist }).toString()}`, {
    headers: as === null ? {} : { cookie: as },
  });

describe("finding covers (TON-112)", () => {
  test("the covers found, each shown through the image proxy", async () => {
    const response = await covers("Kill 'Em All", "Metallica");
    expect(response.status).toBe(200);
    const found = coversSchema.parse(await response.json()).covers;
    expect(found.map(({ title, year, type }) => ({ title, year, type }))).toEqual([
      { title: "Kill ’Em All", year: 1983, type: "Album" },
      { title: "Kill ’Em All for One", year: 1983, type: "EP" },
    ]);
    const [first] = found;
    if (!first) throw new Error("No cover");
    const image = await t.call(artworkPath(first.artworkUrl, first.artworkSignature));
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
  });

  test("nothing found is an empty list", async () => {
    const response = await covers("Nothing Like It", "Nobody Known");
    expect(coversSchema.parse(await response.json())).toEqual({ covers: [] });
  });

  test("MusicBrainz unavailable answers 503, saying so", async () => {
    const response = await covers("Anything", "Down");
    expect(response.status).toBe(503);
    expect(problemSchema.parse(await response.json())).toMatchObject({
      code: "provider_unavailable",
      detail: "Couldn't reach MusicBrainz. Try again.",
    });
  });

  test("a session is required, and a blank title is refused", async () => {
    expect((await covers("Kill 'Em All", "Metallica", null)).status).toBe(401);
    expect((await covers(" ", "Metallica")).status).toBe(422);
  });
});
