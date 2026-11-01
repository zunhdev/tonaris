// The rules of an album's inline cells (DS-45, FR-03.1, FR-02.6).

import { describe, expect, test } from "bun:test";

import { uuidv7, type Album } from "@tonaris/domain";

import { albumChoice, albumEdit, cellText, releaseTypeOptions, typeName } from "./album-edit";

const album = (values: Partial<Album> = {}): Album => ({
  id: uuidv7(),
  title: "Nightfall",
  artistCredit: "Candlemass",
  releaseType: "album",
  isLive: false,
  originalYear: 1987,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  ...values,
});

const live = (values: Partial<Album> = {}) =>
  album({
    isLive: true,
    originalYear: 1990,
    recordingYearStart: 1988,
    recordingYearEnd: 1988,
    artworkUrl: null,
    ...values,
  });

describe("title and artist", () => {
  test("are saved trimmed, and refused when blank", () => {
    expect(albumEdit(album(), "title", "  Nightfall (Remastered) ")).toEqual({
      kind: "save",
      values: { title: "Nightfall (Remastered)" },
    });
    expect(albumEdit(album(), "title", "   ")).toEqual({
      kind: "refuse",
      reason: "Give the album a title.",
    });
    expect(albumEdit(album(), "artistCredit", "")).toEqual({
      kind: "refuse",
      reason: "Give the album an artist.",
    });
    expect(albumEdit(album(), "artistCredit", "Candlemass")).toEqual({ kind: "unchanged" });
  });
});

describe("the year (DS-24)", () => {
  test("of a studio album is its original year, required, as digits", () => {
    expect(cellText(album(), "year")).toBe("1987");
    expect(albumEdit(album(), "year", "1988")).toEqual({
      kind: "save",
      values: { originalYear: 1988 },
    });
    expect(albumEdit(album(), "year", "")).toEqual({
      kind: "refuse",
      reason: "Give the album a year.",
    });
    const format = {
      kind: "refuse",
      reason: "Enter the year as four digits, such as 1986.",
    } as const;
    expect(albumEdit(album(), "year", "nineteen")).toEqual(format);
    expect(albumEdit(album(), "year", "0")).toEqual(format);
    expect(albumEdit(album(), "year", "1978–1982")).toEqual(format);
  });

  test("of a live album with a recording year is that year or range, any dash", () => {
    expect(cellText(live(), "year")).toBe("1988");
    expect(cellText(live({ recordingYearEnd: 1990 }), "year")).toBe("1988–1990");
    expect(albumEdit(live(), "year", "1978-1982")).toEqual({
      kind: "save",
      values: { recordingYearStart: 1978, recordingYearEnd: 1982 },
    });
    expect(albumEdit(live(), "year", "1978 — 1982")).toEqual({
      kind: "save",
      values: { recordingYearStart: 1978, recordingYearEnd: 1982 },
    });
    expect(albumEdit(live({ recordingYearEnd: 1990 }), "year", "1989")).toEqual({
      kind: "save",
      values: { recordingYearStart: 1989, recordingYearEnd: 1989 },
    });
    expect(albumEdit(live(), "year", "1988")).toEqual({ kind: "unchanged" });
  });

  test("a recording range can't run backwards", () => {
    expect(albumEdit(live(), "year", "1982–1978")).toEqual({
      kind: "refuse",
      reason: "The recording period ends before it starts.",
    });
  });

  test("clearing a recording year falls back to the original year, which must exist", () => {
    expect(albumEdit(live(), "year", "")).toEqual({
      kind: "save",
      values: { recordingYearStart: null, recordingYearEnd: null },
    });
    expect(albumEdit(live({ originalYear: null }), "year", "")).toEqual({
      kind: "refuse",
      reason: "Give the album a year.",
    });
  });

  test("of a live album without a recording year is the release year it falls back to", () => {
    const fallback = live({ recordingYearStart: null, recordingYearEnd: null, originalYear: 1979 });
    expect(cellText(fallback, "year")).toBe("1979");
    expect(albumEdit(fallback, "year", "1980")).toEqual({
      kind: "save",
      values: { originalYear: 1980 },
    });
  });
});

describe("the inspector's chronology (DS-46)", () => {
  test("the original year and the recording years are edited each on their own", () => {
    const rainbow = live({ originalYear: 1984, recordingYearStart: null, recordingYearEnd: null });
    expect(cellText(rainbow, "recording")).toBe("");
    expect(cellText(rainbow, "originalYear")).toBe("1984");
    expect(albumEdit(rainbow, "recording", "1978–1982")).toEqual({
      kind: "save",
      values: { recordingYearStart: 1978, recordingYearEnd: 1982 },
    });
    expect(albumEdit(rainbow, "originalYear", "1985")).toEqual({
      kind: "save",
      values: { originalYear: 1985 },
    });
    // Live with a recording year, the original year can go.
    expect(albumEdit(live(), "originalYear", "")).toEqual({
      kind: "save",
      values: { originalYear: null },
    });
    expect(albumEdit(album(), "originalYear", "")).toEqual({
      kind: "refuse",
      reason: "Give the album a year.",
    });
  });

  test("Live off without an original year is refused, and the release type is saved", () => {
    const recordedOnly = live({ originalYear: null });
    expect(albumChoice(recordedOnly, { isLive: false })).toEqual({
      kind: "refuse",
      reason: "Give the album a year.",
    });
    expect(albumChoice(album(), { isLive: true })).toEqual({
      kind: "save",
      values: { isLive: true },
    });
    expect(albumChoice(album(), { releaseType: "ep" })).toEqual({
      kind: "save",
      values: { releaseType: "ep" },
    });
    expect(albumChoice(album(), { releaseType: "album" })).toEqual({ kind: "unchanged" });
  });
});

describe("release types in words (DS-19, FR-05.9)", () => {
  test("the choices are the domain's types by their groups' names, then Unknown", () => {
    expect(releaseTypeOptions.map(({ label }) => label)).toEqual([
      "Album",
      "EP",
      "Compilation",
      "Unknown",
    ]);
  });

  test("a row's type says Live first, and — without a type", () => {
    expect(typeName(album({ releaseType: "ep" }))).toBe("EP");
    expect(typeName(live({ releaseType: "ep" }))).toBe("Live");
    expect(typeName(album({ releaseType: null }))).toBe("—");
  });
});
