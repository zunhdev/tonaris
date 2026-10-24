// TS-45's classification and TS-46's recording years, on MusicBrainz's shapes (TON-43).

import { describe, expect, test } from "bun:test";

import { classify, recordingYears } from "./album-facts";

describe("classify (TS-45, FR-05.9)", () => {
  test("Album and EP map to themselves", () => {
    expect(classify("Album", [])).toEqual({ releaseType: "album", isLive: false });
    expect(classify("EP", [])).toEqual({ releaseType: "ep", isLive: false });
  });

  test("Compilation makes a compilation, and Live makes it live", () => {
    expect(classify("Album", ["Compilation"])).toEqual({
      releaseType: "compilation",
      isLive: false,
    });
    expect(classify("EP", ["Compilation"])).toEqual({ releaseType: "compilation", isLive: false });
    expect(classify("Album", ["Live"])).toEqual({ releaseType: "album", isLive: true });
    expect(classify("Album", ["Compilation", "Live"])).toEqual({
      releaseType: "compilation",
      isLive: true,
    });
  });

  test("Single, Broadcast and Other are Unclassified and not live, whatever their secondary types", () => {
    for (const type of ["Single", "Broadcast", "Other"]) {
      expect(classify(type, [])).toEqual({ isLive: false });
      expect(classify(type, ["Live"])).toEqual({ isLive: false });
      expect(classify(type, ["Compilation", "Live"])).toEqual({ isLive: false });
    }
  });

  test("a type MusicBrainz adds later is Unclassified too", () => {
    expect(classify("Mixtape", ["Live"])).toEqual({ isLive: false });
  });

  test("with no primary type, secondary types still classify, and nothing else is known", () => {
    expect(classify(null, [])).toEqual({});
    expect(classify(undefined, ["Soundtrack"])).toEqual({});
    expect(classify(null, ["Compilation"])).toEqual({ releaseType: "compilation" });
    expect(classify(null, ["Live"])).toEqual({ isLive: true });
  });
});

/** A release with one medium of these recordings' relationships. */
const release = (...recordings: object[][]) => ({
  media: [{ tracks: recordings.map((relations) => ({ recording: { relations } })) }],
});
const placeRel = (begin: string | null, end: string | null = begin) => ({
  type: "recorded at",
  "target-type": "place",
  begin,
  end,
});
const eventRel = (begin: string, end: string = begin) => ({
  type: "recorded at",
  "target-type": "event",
  begin: null,
  end: null,
  event: { "life-span": { begin, end, ended: true } },
});

describe("recordingYears (TS-46)", () => {
  test("a concert on one night spans one year", () => {
    expect(recordingYears(release([eventRel("1975-01-24"), placeRel("1975-01-24")]))).toEqual({
      start: 1975,
      end: 1975,
    });
  });

  test("recordings over years span from the earliest to the latest", () => {
    expect(
      recordingYears(
        release([placeRel("1985-09-30")], [placeRel("1975-10-18")], [placeRel("1980-12-28")]),
      ),
    ).toEqual({ start: 1975, end: 1985 });
  });

  test("an area's 'recorded in' dates count, and partial dates give their year", () => {
    expect(
      recordingYears(
        release([{ type: "recorded in", "target-type": "area", begin: "1977", end: "1978-02" }]),
      ),
    ).toEqual({ start: 1977, end: 1978 });
  });

  test("a recording dated only through its event uses the event's dates", () => {
    expect(recordingYears(release([eventRel("1969-08-15", "1969-08-18"), placeRel(null)]))).toEqual(
      { start: 1969, end: 1969 },
    );
  });

  test("a recording's own dates win over its event's", () => {
    expect(recordingYears(release([eventRel("1970-01-01"), placeRel("1971-03-12")]))).toEqual({
      start: 1971,
      end: 1971,
    });
  });

  test("other relationships, such as a producer's, never date a recording", () => {
    expect(
      recordingYears(release([{ type: "producer", "target-type": "artist", begin: "1990" }])),
    ).toBeUndefined();
  });

  test("no dated recording means no span", () => {
    expect(recordingYears(release([], [placeRel(null)]))).toBeUndefined();
    expect(recordingYears({})).toBeUndefined();
  });
});
