// `describeAlbum()` on recorded MusicBrainz and Cover Art Archive answers (fixtures/describe), for TON-43's cases.

import { describe, expect, test } from "bun:test";

import { cases, ids } from "../fixtures/describe/cases";
import { frontUrl, harness } from "../fixtures/describe/harness";
import recorded from "../fixtures/describe/recorded.json";
import { ProviderUnavailableError } from "./provider-cache";

const run = (testCase: (typeof cases)[keyof typeof cases]) => harness(testCase, { recorded });

/** The values without their sources, for comparing. */
async function valuesOf(testCase: (typeof cases)[keyof typeof cases]) {
  const facts = await run(testCase).describe();
  if (facts.status !== "found") throw new Error(`${testCase.name}: ${facts.status}`);
  return Object.fromEntries(
    Object.entries(facts.values).map(([field, found]) => [field, found.value]),
  );
}

describe("describeAlbum: the release group's facts (TS-41, FR-02.12)", () => {
  test("Bleach: its title, artist, first year, classification and front", async () => {
    const harnessed = run(cases.bleach);
    const facts = await harnessed.describe();
    expect(facts).toEqual({
      status: "found",
      askedId: ids.bleach,
      releaseGroupId: ids.bleach,
      values: {
        title: { value: "Bleach", source: "musicbrainz", ref: ids.bleach },
        artistCredit: { value: "Nirvana", source: "musicbrainz", ref: ids.bleach },
        releaseType: { value: "album", source: "musicbrainz", ref: ids.bleach },
        isLive: { value: false, source: "musicbrainz", ref: ids.bleach },
        originalYear: { value: 1989, source: "musicbrainz", ref: ids.bleach },
        artworkUrl: { value: frontUrl(ids.bleach), source: "coverartarchive", ref: ids.bleach },
      },
    });
    // A studio album: one MusicBrainz lookup, and the archive once.
    expect(harnessed.requests).toEqual([
      `GET https://musicbrainz.org/ws/2/release-group/${ids.bleach}?inc=artist-credits+releases&fmt=json`,
      `HEAD ${frontUrl(ids.bleach)}`,
    ]);
  });

  test("the same album again within 7 days sends no request", async () => {
    const harnessed = run(cases.bleach);
    const first = await harnessed.describe();
    const asked = harnessed.requests.length;
    expect(await harnessed.describe()).toEqual(first);
    expect(harnessed.requests).toHaveLength(asked);
  });
});

describe("describeAlbum: classification (TS-45, decided 24 October 2026)", () => {
  test("a live single is Unclassified and not live, so it never asks for recordings", async () => {
    const harnessed = run(cases.liveSingle);
    const facts = await harnessed.describe();
    expect(facts.status === "found" && facts.values.releaseType).toBeUndefined();
    expect(facts.status === "found" && facts.values.isLive?.value).toBe(false);
    expect(harnessed.requests.filter((request) => request.includes("/ws/2/release/"))).toEqual([]);
  });
});

describe("describeAlbum: recording years (TS-46)", () => {
  test("The Köln Concert, recorded on one night: 1975, from its first official release", async () => {
    const harnessed = run(cases.koln);
    const facts = await harnessed.describe();
    if (facts.status !== "found") throw new Error(facts.status);
    expect(facts.values).toMatchObject({
      releaseType: { value: "album" },
      isLive: { value: true },
      originalYear: { value: 1975 },
      recordingYearStart: { value: 1975, ref: "f3a288bb-c303-4564-b194-a346e2655a12" },
      recordingYearEnd: { value: 1975, ref: "f3a288bb-c303-4564-b194-a346e2655a12" },
    });
    // A live album: the release group, then its first official release's recordings.
    expect(
      harnessed.requests.filter((request) => request.includes("musicbrainz.org")),
    ).toHaveLength(2);
  });

  test("Live/1975–85, recorded over years: 1975–1985, from the first official release, not the bootleg", async () => {
    expect(await valuesOf(cases.springsteen)).toMatchObject({
      title: "Live/1975–85",
      artistCredit: "Bruce Springsteen & The E Street Band",
      releaseType: "compilation",
      isLive: true,
      originalYear: 1985,
      recordingYearStart: 1975,
      recordingYearEnd: 1985,
    });
    const facts = await run(cases.springsteen).describe();
    expect(facts.status === "found" && facts.values.recordingYearStart?.ref).toBe(
      "e34abdb8-6548-4337-8a1f-3deca9e90095",
    );
  });
});

describe("describeAlbum: changed release group ids (TS-44)", () => {
  test("a merged release group answers under its new id", async () => {
    const harnessed = run(cases.merged);
    const facts = await harnessed.describe();
    expect(facts).toMatchObject({
      status: "found",
      askedId: ids.merged,
      releaseGroupId: ids.mergedInto,
      values: { title: { value: "Shoot for the Stars Aim for the Moon", ref: ids.mergedInto } },
    });
    expect(harnessed.requests).toContain(`HEAD ${frontUrl(ids.mergedInto)}`);
  });

  test("a deleted release group answers deleted, after one request", async () => {
    const harnessed = run(cases.deleted);
    expect(await harnessed.describe()).toEqual({ status: "deleted", askedId: ids.deleted });
    expect(harnessed.requests).toHaveLength(1);
  });
});

describe("describeAlbum: failures (FR-03.4, TS-90)", () => {
  test("no front on the Cover Art Archive means no artwork", async () => {
    const values = await valuesOf(cases.noFront);
    expect(values.artworkUrl).toBeUndefined();
    expect(values.originalYear).toBe(1989);
  });

  test("the Cover Art Archive down leaves the artwork out, and the rest in", async () => {
    const values = await valuesOf(cases.archiveDown);
    expect(values.artworkUrl).toBeUndefined();
    expect(values).toMatchObject({ title: "Bleach", originalYear: 1989 });
  });

  test("MusicBrainz busy throughout fails as unavailable, naming no query", async () => {
    const error = await run(cases.musicBrainzBusy)
      .describe()
      .catch((caught: unknown) => caught);
    if (!(error instanceof ProviderUnavailableError)) throw new Error("Expected unavailable");
    expect(error.provider).toBe("musicbrainz");
    expect(error.message).not.toContain("inc=");
  });
});
