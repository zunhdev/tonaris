import { describe, expect, test } from "bun:test";

import {
  blankAlbum,
  planEnrichment,
  type AlbumFacts,
  type EnrichableAlbum,
  type ProvenanceSource,
  type Sourced,
} from "./enrichment";

const bleachId = "f1afec0b-26dd-3db5-9aa1-c91229a74a24";
const mergedId = "fcd3637b-3365-4780-802d-0013b070bca2";
const mergedIntoId = "d6d1de65-7e43-4277-b723-fc74a2b385e1";
const now = new Date("2026-10-24T12:00:00Z");

const fromMusicBrainz = <T>(value: T, ref = bleachId): Sourced<T> => ({
  value,
  source: "musicbrainz",
  ref,
});

/** MusicBrainz's *Bleach*: an Album, first released in 1989, with a front on the Cover Art Archive. */
const bleach: AlbumFacts = {
  status: "found",
  askedId: bleachId,
  releaseGroupId: bleachId,
  values: {
    title: fromMusicBrainz("Bleach"),
    artistCredit: fromMusicBrainz("Nirvana"),
    releaseType: fromMusicBrainz("album" as const),
    isLive: fromMusicBrainz(false),
    originalYear: fromMusicBrainz(1989),
    artworkUrl: {
      value: `https://coverartarchive.org/release-group/${bleachId}/front-500`,
      source: "coverartarchive",
      ref: bleachId,
    },
  },
};

/** A live album, recorded 1975–1985, read from its first official release. */
const liveFacts: AlbumFacts = {
  status: "found",
  askedId: bleachId,
  releaseGroupId: bleachId,
  values: {
    title: fromMusicBrainz("Live/1975–85"),
    artistCredit: fromMusicBrainz("Bruce Springsteen"),
    releaseType: fromMusicBrainz("compilation" as const),
    isLive: fromMusicBrainz(true),
    originalYear: fromMusicBrainz(1986),
    recordingYearStart: fromMusicBrainz(1975, "e34abdb8-6548-4337-8a1f-3deca9e90095"),
    recordingYearEnd: fromMusicBrainz(1985, "e34abdb8-6548-4337-8a1f-3deca9e90095"),
  },
};

/** An album saved by hand: every value its owner's. */
const saved = (values: Partial<EnrichableAlbum> = {}): EnrichableAlbum => ({
  title: "Bleach",
  artistCredit: "Nirvana",
  releaseType: null,
  isLive: false,
  originalYear: 1990,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
  releaseGroupId: bleachId,
  ...values,
});

describe("planEnrichment: only missing values are filled (TS-42, FR-03.3, AC-10)", () => {
  test("a person's values are kept, and gaps are filled", () => {
    const plan = planEnrichment(saved(), bleach, now);
    expect(plan.values).toEqual({
      releaseType: "album",
      artworkUrl: `https://coverartarchive.org/release-group/${bleachId}/front-500`,
    });
    expect(plan.identity).toBe("unchanged");
    expect(plan.releaseGroupId).toBeUndefined();
  });

  test("a conflicting classification is kept", () => {
    const plan = planEnrichment(saved({ releaseType: "ep" }), bleach, now);
    expect(plan.values.releaseType).toBeUndefined();
  });

  test("enriching again plans nothing", () => {
    const first = planEnrichment(saved(), bleach, now);
    const again = planEnrichment(saved(first.values), bleach, now);
    expect(again).toEqual({ identity: "unchanged", values: {}, provenance: [] });
  });

  test("an existing artwork URL is kept (FR-03.4)", () => {
    const plan = planEnrichment(
      saved({ artworkUrl: "https://example.com/bleach.jpg" }),
      bleach,
      now,
    );
    expect(plan.values.artworkUrl).toBeUndefined();
  });

  test("what the source lacks stays unknown", () => {
    const { originalYear: _, ...values } = bleach.status === "found" ? bleach.values : {};
    const plan = planEnrichment({ ...blankAlbum }, { ...bleach, values }, now);
    expect(plan.values.originalYear).toBeUndefined();
    expect("originalYear" in plan.values).toBe(false);
  });

  test("each filled value records its source, its MBID and when it was retrieved (TS-15)", () => {
    const plan = planEnrichment(saved(), bleach, now);
    expect(plan.provenance).toEqual([
      { field: "releaseType", source: "musicbrainz", sourceRef: bleachId, retrievedAt: now },
      { field: "artworkUrl", source: "coverartarchive", sourceRef: bleachId, retrievedAt: now },
    ]);
  });
});

describe("planEnrichment: a new album (FR-02.12)", () => {
  test("a blank album takes the release group's title, artist and first year", () => {
    const plan = planEnrichment(blankAlbum, bleach, now);
    expect(plan.values).toMatchObject({
      title: "Bleach",
      artistCredit: "Nirvana",
      releaseType: "album",
      isLive: false,
      originalYear: 1989,
    });
    expect(plan.identity).toBe("set");
    expect(plan.releaseGroupId).toBe(bleachId);
    const sources = Object.fromEntries(
      plan.provenance.map((entry): [string, ProvenanceSource] => [entry.field, entry.source]),
    );
    expect(sources).toEqual({
      title: "musicbrainz",
      artistCredit: "musicbrainz",
      releaseType: "musicbrainz",
      isLive: "musicbrainz",
      originalYear: "musicbrainz",
      artworkUrl: "coverartarchive",
    });
  });
});

describe("planEnrichment: recording years (TS-46)", () => {
  test("a live album gets its recording range, from the release it was read from", () => {
    const plan = planEnrichment(blankAlbum, liveFacts, now);
    expect(plan.values).toMatchObject({ recordingYearStart: 1975, recordingYearEnd: 1985 });
    expect(plan.provenance.filter((entry) => entry.field.startsWith("recording"))).toEqual([
      {
        field: "recordingYearStart",
        source: "musicbrainz",
        sourceRef: "e34abdb8-6548-4337-8a1f-3deca9e90095",
        retrievedAt: now,
      },
      {
        field: "recordingYearEnd",
        source: "musicbrainz",
        sourceRef: "e34abdb8-6548-4337-8a1f-3deca9e90095",
        retrievedAt: now,
      },
    ]);
  });

  test("an album the owner says isn't live stays so, with no recording years", () => {
    const plan = planEnrichment(saved({ isLive: false }), liveFacts, now);
    expect(plan.values.isLive).toBeUndefined();
    expect(plan.values.recordingYearStart).toBeUndefined();
    expect(plan.values.recordingYearEnd).toBeUndefined();
  });

  test("the range is one value: a recording year the owner entered keeps the range theirs", () => {
    const plan = planEnrichment(
      saved({ isLive: true, recordingYearStart: 1984, recordingYearEnd: null }),
      liveFacts,
      now,
    );
    expect(plan.values.recordingYearStart).toBeUndefined();
    expect(plan.values.recordingYearEnd).toBeUndefined();
  });

  test("an album the owner marked live takes the range", () => {
    const plan = planEnrichment(saved({ isLive: true }), liveFacts, now);
    expect(plan.values).toMatchObject({ recordingYearStart: 1975, recordingYearEnd: 1985 });
  });
});

describe("planEnrichment: changed release group ids (TS-44)", () => {
  const merged: AlbumFacts = { ...bleach, askedId: mergedId, releaseGroupId: mergedIntoId };

  test("a merged release group's new id is stored, and gaps are filled", () => {
    const plan = planEnrichment(saved({ releaseGroupId: mergedId }), merged, now);
    expect(plan.identity).toBe("merged");
    expect(plan.releaseGroupId).toBe(mergedIntoId);
    expect(plan.values.releaseType).toBe("album");
  });

  test("an album already under the new id is unchanged", () => {
    const plan = planEnrichment(saved({ releaseGroupId: mergedIntoId }), merged, now);
    expect(plan.identity).toBe("unchanged");
    expect(plan.releaseGroupId).toBeUndefined();
  });

  test("a deleted release group leaves the album unidentified, with its data", () => {
    const plan = planEnrichment(saved(), { status: "deleted", askedId: bleachId }, now);
    expect(plan).toEqual({ identity: "deleted", releaseGroupId: null, values: {}, provenance: [] });
  });

  test("a deleted release group means nothing to an album that never had one", () => {
    const plan = planEnrichment(blankAlbum, { status: "deleted", askedId: bleachId }, now);
    expect(plan).toEqual({ identity: "unchanged", values: {}, provenance: [] });
  });

  test("an album identified as another release group takes nothing", () => {
    const other = "9b8e1d8f-7b0c-4c2a-9a52-2a8a3f0f7c11";
    expect(planEnrichment(saved({ releaseGroupId: other }), bleach, now)).toEqual({
      identity: "elsewhere",
      values: {},
      provenance: [],
    });
    expect(
      planEnrichment(saved({ releaseGroupId: other }), { status: "deleted", askedId: bleachId }),
    ).toEqual({ identity: "elsewhere", values: {}, provenance: [] });
  });
});
