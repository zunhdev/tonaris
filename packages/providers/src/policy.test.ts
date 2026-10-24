// Provider policy (TS-15, FR-08.8): today's flags withhold nothing, and a withheld value is marked, never dropped.

import { describe, expect, test } from "bun:test";

import { provenanceSources, type ProvenanceSource } from "@tonaris/domain";

import { filterFields, policy, withheld, type PolicyFlags } from "./policy";

const album = {
  title: "Bleach",
  artistCredit: "Nirvana",
  originalYear: 1989,
  artworkUrl:
    "https://coverartarchive.org/release-group/f1afec0b-26dd-3db5-9aa1-c91229a74a24/front-500",
  id: "019a1b2c-0000-7000-8000-000000000001",
};
const sources: Partial<Record<keyof typeof album, ProvenanceSource>> = {
  title: "itunes-lookup",
  artistCredit: "user",
  originalYear: "musicbrainz",
  artworkUrl: "coverartarchive",
};

describe("policy (TS-15)", () => {
  test("every current source is stored, visible to agents and exported, with no attribution", () => {
    for (const source of provenanceSources) {
      expect(policy[source]).toEqual({
        store: true,
        agentVisible: true,
        exportable: true,
        attribution: null,
      });
    }
  });

  test("nothing is withheld today, for agents or exports", () => {
    expect(filterFields(album, sources, "agent")).toEqual(album);
    expect(filterFields(album, sources, "export")).toEqual(album);
  });

  test("a value a policy withholds is replaced by the marker, and the others pass (FR-08.8)", () => {
    const flags: Record<ProvenanceSource, PolicyFlags> = {
      ...policy,
      "itunes-lookup": { ...policy["itunes-lookup"], exportable: false },
    };
    expect(filterFields(album, sources, "export", flags)).toEqual({ ...album, title: withheld });
    expect(filterFields(album, sources, "agent", flags)).toEqual(album);
    expect(withheld).toEqual({ withheld: "provider-policy" });
  });
});
