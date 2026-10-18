// The TON-16 rules: title cleaning, artist splitting, and strict decisions by release or by album.

import { describe, expect, test } from "bun:test";

import type { Hints } from "./itunes";
import { type Candidate, cleanTitle, decide, firstArtist, passes, rules } from "./rules";

const hints: Hints = {
  title: "Bleach (Deluxe Edition)",
  artist: "Nirvana",
  date: "1989-06-15",
  trackCount: 25,
  storefront: "fi",
};

const release = (values: Partial<Candidate>): Candidate => ({
  id: "r",
  title: "Bleach",
  artistCredit: "Nirvana",
  date: "2009-11-02",
  trackCount: 25,
  releaseGroupId: "rg-bleach",
  releaseGroupTitle: "Bleach",
  artistNames: ["Nirvana"],
  firstReleaseDate: "1989-06-15",
  ...values,
});

const rule = (name: string) => {
  const found = rules.find((r) => r.name === name);
  if (!found) throw new Error(`no rule ${name}`);
  return found;
};

describe("cleanTitle", () => {
  test("drops Apple's EP and Single suffixes and trailing edition notes", () => {
    expect(cleanTitle("EP2 - EP")).toBe("EP2");
    expect(cleanTitle("Bleach (Deluxe Edition)")).toBe("Bleach");
    expect(cleanTitle("Tchaikovsky: The Nutcracker (Remastered 2026)")).toBe(
      "Tchaikovsky: The Nutcracker",
    );
    expect(cleanTitle("Abbey Road (Remastered) [Super Deluxe Edition]")).toBe("Abbey Road");
  });

  test("keeps notes that are part of the title", () => {
    expect(cleanTitle("Live at Berkeley (First Show)")).toBe("Live at Berkeley (First Show)");
    expect(cleanTitle("(What's the Story) Morning Glory?")).toBe(
      "(What's the Story) Morning Glory?",
    );
  });
});

test("firstArtist splits common credit forms", () => {
  expect(firstArtist("Berlin Philharmonic Orchestra & Mstislav Rostropovich")).toBe(
    "Berlin Philharmonic Orchestra",
  );
  expect(firstArtist("Drake feat. Rihanna")).toBe("Drake");
  expect(firstArtist("Charli xcx")).toBe("Charli xcx");
});

describe("loose titles and artist names", () => {
  const loose = rule("…loose titles and artist names, no track count");

  test("ignore punctuation and featured artists in the title", () => {
    const ricordi = { ...hints, title: "I miei ricordi....", artist: "Gianni Celeste" };
    const candidate = release({ title: "I miei ricordi...", artistCredit: "Gianni Celeste" });
    expect(passes(loose, ricordi, candidate)).toBe(true);
    expect(passes(rule("…clean titles"), ricordi, candidate)).toBe(false);
    const feat = { ...hints, title: "Cançons (feat. Judit Neddermann)", artist: "Banda" };
    expect(passes(loose, feat, release({ title: "Cançons", artistCredit: "Banda" }))).toBe(true);
  });

  test("match a transliterated artist through the sort name", () => {
    const ikra = { ...hints, title: "Икра (Deluxe)", artist: "Mumiy Troll" };
    const candidate = release({
      title: "Икра",
      artistCredit: "Мумий Тролль",
      artistNames: ["Мумий Тролль", "Mumiy Troll'"],
    });
    expect(passes(loose, ikra, candidate)).toBe(true);
    expect(passes(rule("…and original year allowed"), ikra, candidate)).toBe(false);
  });
});

describe("decide", () => {
  const editions = [
    release({ id: "deluxe-us", date: "2009-11-02" }),
    release({ id: "deluxe-xw", date: "2009-11-02" }),
  ];

  test("the original year lets a reissue match the album's first year", () => {
    const clean = rule("…clean titles");
    expect(passes(clean, hints, release({ date: "1989-06-15" }))).toBe(true);
    expect(passes(clean, hints, release({}))).toBe(false);
    expect(passes(rule("…and original year allowed"), hints, release({}))).toBe(true);
  });

  test("two editions of one album: ambiguous as a release, identified as an album", () => {
    const original = rule("…and original year allowed");
    expect(decide({ ...original, accept: "one-release" }, hints, editions)).toMatchObject({
      outcome: "ambiguous",
      releases: 2,
      albums: 1,
    });
    expect(decide(original, hints, editions)).toEqual({
      outcome: "accepted",
      releaseGroupId: "rg-bleach",
      releases: 2,
      albums: 1,
    });
  });

  test("two albums passing is never accepted", () => {
    const other = release({ id: "x", releaseGroupId: "rg-other", releaseGroupTitle: "Bleach" });
    expect(decide(rule("…and original year allowed"), hints, [...editions, other])).toMatchObject({
      outcome: "ambiguous",
      albums: 2,
    });
  });
});
