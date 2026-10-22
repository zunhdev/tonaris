// Album order and year until sorting exists (FR-05.5, FR-05.6, DS-44).

import { describe, expect, test } from "bun:test";

import { uuidv7, type Album } from "@tonaris/domain";

import { chronological, sortYear, yearLabel } from "./order";

const album = (title: string, values: Partial<Album> = {}): Album => ({
  id: uuidv7(),
  title,
  artistCredit: "Candlemass",
  releaseType: "album",
  isLive: false,
  originalYear: 1986,
  recordingYearStart: null,
  recordingYearEnd: null,
  ...values,
});

describe("album order until sorting (DS-44)", () => {
  test("live albums sort by their recording year, others and live ones without it by their original year", () => {
    expect(sortYear(album("Studio", { originalYear: 1987 }))).toBe(1987);
    expect(
      sortYear(album("Live", { isLive: true, originalYear: 1990, recordingYearStart: 1988 })),
    ).toBe(1988);
    expect(sortYear(album("Live, unknown", { isLive: true, originalYear: 1990 }))).toBe(1990);
    expect(sortYear(album("Unknown", { originalYear: null }))).toBeNull();
  });

  test("earliest first, unknown years last, ties by title ignoring case and accents, then by ID", () => {
    const unknown = album("Unknown", { originalYear: null });
    const nightfall = album("Nightfall", { originalYear: 1987 });
    const live = album("Live in Stockholm", {
      isLive: true,
      originalYear: 1990,
      recordingYearStart: 1985,
    });
    const epicus = album("epicus doomicus", { originalYear: 1986 });
    const ancient = album("Äncient Dreams", { originalYear: 1986 });
    const twin = album("Nightfall", { id: epicus.id.replace(/.$/, "0"), originalYear: 1987 });
    const ordered = chronological([unknown, nightfall, live, epicus, ancient]).map(
      (each) => each.title,
    );
    expect(ordered).toEqual([
      "Live in Stockholm",
      "Äncient Dreams",
      "epicus doomicus",
      "Nightfall",
      "Unknown",
    ]);
    const ids = chronological([nightfall, twin]).map((each) => each.id);
    expect(ids).toEqual([nightfall.id, twin.id].toSorted());
  });

  test("the year shown", () => {
    expect(yearLabel(album("Studio"))).toBe("1986");
    expect(
      yearLabel(album("Range", { isLive: true, recordingYearStart: 1978, recordingYearEnd: 1982 })),
    ).toBe("1978–1982");
    expect(
      yearLabel(
        album("One year", { isLive: true, recordingYearStart: 1988, recordingYearEnd: 1988 }),
      ),
    ).toBe("1988");
    expect(yearLabel(album("Unknown", { originalYear: null }))).toBe("—");
  });
});
