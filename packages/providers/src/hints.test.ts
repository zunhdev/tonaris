// The step-4 rule (TS-41) on hand-made candidates. The search itself is replayed from MusicBrainz in
// identify.test.ts.

import { describe, expect, test } from "bun:test";

import {
  cleanTitle,
  decide,
  firstArtist,
  looseKey,
  passes,
  searchTitle,
  type Candidate,
} from "./hints";

describe("cleanTitle", () => {
  test("drops Apple's suffixes and trailing edition notes", () => {
    expect(cleanTitle("Bleach (Deluxe Edition)")).toBe("Bleach");
    expect(cleanTitle("Abbey Road [2019 Remaster]")).toBe("Abbey Road");
    expect(cleanTitle("Fearless (Standard)")).toBe("Fearless");
    expect(cleanTitle("Doing - EP")).toBe("Doing");
    expect(cleanTitle("Bright Future - Single")).toBe("Bright Future");
    expect(cleanTitle("Nevermind (Remastered) [Deluxe Edition]")).toBe("Nevermind");
  });

  test("keeps re-recordings and notes that aren't editions", () => {
    expect(cleanTitle("Red (Taylor's Version)")).toBe("Red (Taylor's Version)");
    expect(cleanTitle("Red (Taylor’s Version) [Deluxe]")).toBe("Red (Taylor’s Version)");
    expect(cleanTitle("Speak Now (Re-Recorded)")).toBe("Speak Now (Re-Recorded)");
    expect(cleanTitle("Live (at the BBC)")).toBe("Live (at the BBC)");
  });

  test("the search title also drops featured artists", () => {
    expect(searchTitle("Old Town Road (feat. Billy Ray Cyrus) - Single")).toBe("Old Town Road");
  });
});

describe("names", () => {
  test("first artists and loose keys", () => {
    expect(firstArtist("Simon & Garfunkel")).toBe("Simon");
    expect(firstArtist("Beyoncé feat. Jay-Z")).toBe("Beyoncé");
    expect(firstArtist("Skrillex x Diplo")).toBe("Skrillex");
    expect(looseKey("I miei ricordi....")).toBe(looseKey("I miei ricordi..."));
    expect(looseKey("Sigur Rós")).toBe(looseKey("sigur ros"));
  });
});

const candidate = (values: Partial<Candidate>): Candidate => ({
  releaseId: "r1",
  title: "Икра",
  artistCredit: "Мумий Тролль",
  artistNames: ["Мумий Тролль", "Мумий Тролль", "Mumiy Troll'"],
  date: "1997-11-21",
  status: "Official",
  releaseGroupId: "g1",
  releaseGroupTitle: "Икра",
  primaryType: "Album",
  firstReleaseDate: "1997-11-21",
  ...values,
});

const ikra = { title: "Икра (Deluxe)", artist: "Mumiy Troll", date: "1997-11-21" };

describe("passes", () => {
  test("a sort name stands for the artist, and either year will do", () => {
    expect(passes(ikra, candidate({}))).toBe(true);
    expect(passes(ikra, candidate({ date: "2007-01-01" }))).toBe(true);
    expect(passes(ikra, candidate({ date: "2007-01-01", firstReleaseDate: "2006" }))).toBe(false);
  });

  test("hints without a year match no release, not even an undated one", () => {
    const undated = candidate({ date: undefined, firstReleaseDate: undefined });
    expect(passes({ ...ikra, date: "" }, undated)).toBe(false);
    expect(passes({ ...ikra, date: "1997" }, undated)).toBe(false);
  });

  test("only official albums and EPs, and singles when Apple says so", () => {
    expect(passes(ikra, candidate({ status: "Bootleg" }))).toBe(false);
    expect(passes(ikra, candidate({ primaryType: "Single" }))).toBe(false);
    expect(passes(ikra, candidate({ primaryType: "EP" }))).toBe(true);
    const single = { title: "Икра - Single", artist: "Mumiy Troll", date: "1997" };
    expect(passes(single, candidate({ primaryType: "Single" }))).toBe(true);
  });

  test("another title or artist fails", () => {
    expect(passes(ikra, candidate({ title: "Чёрная икра" }))).toBe(false);
    expect(passes({ ...ikra, artist: "Someone Else" }, candidate({}))).toBe(false);
  });

  test("a track count is checked only when the hints carry one, as YouTube's do", () => {
    expect(passes(ikra, candidate({ trackCount: 4 }))).toBe(true);
    const playlist = { ...ikra, tracks: 12 };
    expect(passes(playlist, candidate({ trackCount: 12 }))).toBe(true);
    expect(passes(playlist, candidate({ trackCount: 4, primaryType: "EP" }))).toBe(false);
    expect(passes(playlist, candidate({}))).toBe(false);
  });
});

describe("decide", () => {
  test("one album, whichever of its releases pass", () => {
    expect(decide(ikra, [candidate({}), candidate({ releaseId: "r2" })])).toEqual({
      kind: "one",
      releaseGroupId: "g1",
    });
  });

  test("two albums are several, and none is none", () => {
    expect(
      decide(ikra, [
        candidate({}),
        candidate({ releaseGroupId: "g2", releaseGroupTitle: "Икра (2)" }),
      ]),
    ).toEqual({
      kind: "several",
      albums: [
        { releaseGroupId: "g1", title: "Икра" },
        { releaseGroupId: "g2", title: "Икра (2)" },
      ],
    });
    expect(decide(ikra, [])).toEqual({ kind: "none" });
  });
});
