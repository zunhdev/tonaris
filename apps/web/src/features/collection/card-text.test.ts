import { describe, expect, test } from "bun:test";

import {
  cardLines,
  fullCard,
  linksThatFit,
  wordsHeight,
  yearWidth,
  type CardType,
  type Measure,
} from "./card-text";

const type: CardType = {
  title: "title",
  small: "small",
  smallStrong: "strong",
  titleLine: 20,
  smallLine: 16,
};
/** Every character 7 px wide in the title's font, 6 in the others. */
const measure: Measure = (text, font) => text.length * (font === "title" ? 7 : 6);

const album = (title: string, artistCredit: string) => ({ title, artistCredit });
const year = (
  originalYear: number | null,
  live: { isLive?: boolean; recordingYearStart?: number; recordingYearEnd?: number } = {},
): Parameters<typeof yearWidth>[0] => ({
  originalYear,
  isLive: live.isLive ?? null,
  recordingYearStart: live.recordingYearStart ?? null,
  recordingYearEnd: live.recordingYearEnd ?? null,
});

describe("cardLines (DS-22, TON-280)", () => {
  test("a title that fits on one line leaves the artist two when it needs them", () => {
    expect(
      cardLines(album("Agrippina", "Jacobs, Akademie für Alte Musik Berlin"), 200, type, measure),
    ).toEqual({
      title: 1,
      artist: 2,
    });
    expect(cardLines(album("Orchid", "Opeth"), 200, type, measure)).toEqual({
      title: 1,
      artist: 1,
    });
  });

  test("a title that doesn't fit takes two lines, and the artist one", () => {
    expect(
      cardLines(album("Border: Day One • 1st Mini Album", "ENHYPEN"), 200, type, measure),
    ).toEqual({
      title: 2,
      artist: 1,
    });
  });

  test("a title just short of the width counts as too long, so it never ends in an ellipsis", () => {
    // 28 characters are 196 px: they fit a 200 px card, but not a 197 px one, given the 2 px of slack.
    expect(cardLines(album("x".repeat(28), "A"), 200, type, measure).title).toBe(1);
    expect(cardLines(album("x".repeat(28), "A"), 197, type, measure).title).toBe(2);
  });

  test("a card is full when its words take three lines", () => {
    expect(fullCard({ title: 2, artist: 1 })).toBe(true);
    expect(fullCard({ title: 1, artist: 2 })).toBe(true);
    expect(fullCard({ title: 1, artist: 1 })).toBe(false);
  });

  test("a row without a full card is a title line shorter", () => {
    expect(wordsHeight(true, type)).toBe(88);
    expect(wordsHeight(false, type)).toBe(68);
    expect(wordsHeight(true, { ...type, titleLine: 22, smallLine: 18 })).toBe(96);
  });
});

describe("yearWidth (DS-24)", () => {
  test("a year, then the separator when links follow", () => {
    expect(yearWidth(year(1995), false, type, measure)).toBe(24);
    expect(yearWidth(year(1995), true, type, measure)).toBe(42);
  });

  test("a recorded range carries rec., and an unknown recording year its marker", () => {
    expect(
      yearWidth(
        year(null, { isLive: true, recordingYearStart: 1965, recordingYearEnd: 1966 }),
        false,
        type,
        measure,
      ),
    ).toBe(9 * 6 + 4 * 6 + 4);
    expect(yearWidth(year(2001, { isLive: true }), false, type, measure)).toBe(24 + 8 + 6 + 14);
  });
});

describe("linksThatFit (TON-280)", () => {
  // Spotify 7, Apple Music 11, Qobuz 5 and Tidal 5 characters: 55, 79, 43 and 43 px with their arrows.
  const four = ["spotify", "apple-music", "qobuz", "tidal"] as const;

  test("every link when all fit, with nothing for +N", () => {
    expect(linksThatFit(["spotify", "tidal"], 42, 200, type, measure)).toBe(2);
    expect(linksThatFit(four, 0, 400, type, measure)).toBe(4);
  });

  test("only whole links, leaving room for +N", () => {
    // After 42 px of year, 156 px are left: Spotify and "+3" take 89; with Apple Music too, 178.
    expect(linksThatFit(four, 42, 200, type, measure)).toBe(1);
    // 290 px leave 246: all four take 250, but Spotify, Apple Music and Qobuz with "+1" take 231.
    expect(linksThatFit(four, 42, 290, type, measure)).toBe(3);
  });

  test("none, when even the first link and +N don't fit", () => {
    expect(linksThatFit(four, 42, 100, type, measure)).toBe(0);
  });
});
