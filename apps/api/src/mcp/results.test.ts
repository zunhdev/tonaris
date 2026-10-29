// How tools present albums and pages to agents (TS-15, TS-65).

import { describe, expect, test } from "bun:test";

import { policy, withheld } from "@tonaris/providers";

import { agentAlbum, nextCursor, offsetOf, summaryKeys } from "./results";

const album = {
  id: "01a1886e-9df0-726c-a42e-a0b5e0e7bf19",
  title: "Nightfall",
  artistCredit: "Candlemass",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1987,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  sources: { title: "musicbrainz" as const, originalYear: "user" as const },
};

describe("agentAlbum (TS-15)", () => {
  test("passes every value today's policy allows, and never the sources", () => {
    expect(agentAlbum(album, summaryKeys)).toEqual({
      id: album.id,
      title: "Nightfall",
      artistCredit: "Candlemass",
      originalYear: 1987,
      releaseType: "album",
    });
  });

  test("replaces a value from a source agents may not see with the marker", () => {
    const closed = { ...policy, musicbrainz: { ...policy.musicbrainz, agentVisible: false } };
    expect(agentAlbum(album, ["title", "originalYear"], closed)).toEqual({
      id: album.id,
      title: withheld,
      originalYear: 1987,
    });
  });
});

describe("cursors (TS-65)", () => {
  test("a cursor stands for the next page's offset, until the last page", () => {
    const cursor = nextCursor(0, 200, 205);
    expect(cursor).not.toBeNull();
    expect(offsetOf(cursor ?? undefined)).toBe(200);
    expect(nextCursor(200, 5, 205)).toBeNull();
    expect(offsetOf(undefined)).toBe(0);
    expect(offsetOf("nonsense")).toBeUndefined();
  });
});
