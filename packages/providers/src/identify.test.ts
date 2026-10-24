// TS-41's chain on recorded MusicBrainz and iTunes Lookup answers (fixtures/identify): each step's cases from the
// G1 spikes and the creator's links, track links, agent captures, the Spotify rules, and TS-27's outcomes.

import { describe, expect, test } from "bun:test";

import { outcomeSchema } from "@tonaris/domain";

import { cases } from "../fixtures/identify/cases";
import { harness, type IdentifyCase } from "../fixtures/identify/harness";
import recorded from "../fixtures/identify/recorded.json";
import { identificationOutcome, unidentifiedReasons, type Identification } from "./identify";

async function run(testCase: IdentifyCase) {
  const replay = harness(testCase, { recorded });
  const answer = await replay.identify();
  return { answer, requests: replay.requests, cache: replay.cache };
}

/** The hosts a run asked, in order. */
const hosts = (requests: readonly string[]) =>
  requests.map((request) => new URL(request.split(" ")[1] ?? "").hostname);

/** The requests a run sent to `host`. */
const to = (host: string, requests: readonly string[]) =>
  requests.filter((request) => new URL(request.split(" ")[1] ?? "").hostname === host);

const album = {
  doing: "1fc45f68-7542-45de-8514-66b566af473d",
  randomAccessMemories: "aa997ea0-2936-40bd-884d-3af8a0e064dc",
  ikra: "54dc2ea4-d3da-319d-8ee9-c2f4faf98581",
  ideal: "06116135-e106-4757-b041-be4b4a304c9f",
  kindOfBlue: "8e8a594f-2175-38c7-a871-abb68ec363e7",
  redTaylorsVersion: "67727253-f1c0-4243-9270-f9f1401c3b8c",
  bleach: "f1afec0b-26dd-3db5-9aa1-c91229a74a24",
  brightFuture: "60db66ba-34f8-4a1d-b91a-67e85cfcb269",
};

describe("the chain's order (FR-02.1, TS-41)", () => {
  test("step 1: a link already saved answers without asking anyone", async () => {
    const { answer, requests } = await run(cases.saved);
    expect(answer).toMatchObject({
      status: "linked",
      albumId: "0199e0a1-0000-7000-8000-000000000001",
    });
    expect(requests).toEqual([]);
  });

  test("step 2: a Spotify album MusicBrainz knows by URL, and a short link to it", async () => {
    const { answer, requests } = await run(cases.spotifyUrl);
    expect(answer).toMatchObject({ status: "identified", step: 2, releaseGroupId: album.doing });
    expect(hosts(requests)).toEqual(["musicbrainz.org", "musicbrainz.org"]);
    const short = await run(cases.spotifyShortLink);
    expect(short.answer).toMatchObject({ status: "identified", releaseGroupId: album.doing });
    expect(short.requests[0]).toBe("GET https://spotify.link/abc123XYZ");
  });

  test("step 3: a Spotify album MusicBrainz knows by its barcode", async () => {
    const { answer, requests } = await run(cases.spotifyBarcode);
    expect(answer).toMatchObject({
      status: "identified",
      step: 3,
      releaseGroupId: album.randomAccessMemories,
    });
    expect(requests.some((request) => request.includes("query=barcode"))).toBe(true);
  });

  test("step 4: Apple's hints for Икра (Deluxe), found by title when the artist is spelt otherwise", async () => {
    const { answer, requests } = await run(cases.appleHints);
    expect(answer).toMatchObject({ status: "identified", step: 4, releaseGroupId: album.ikra });
    expect(
      requests.some((request) => request.startsWith("GET https://itunes.apple.com/lookup")),
    ).toBe(true);
  });
});

describe("track links (FR-02.3)", () => {
  test("a Spotify track's album comes from Get Track", async () => {
    const { answer, requests } = await run(cases.spotifyTrack);
    expect(answer).toMatchObject({
      status: "identified",
      step: 3,
      releaseGroupId: album.randomAccessMemories,
    });
    expect(requests).toContain("GET https://api.spotify.com/v1/tracks/1111111111111111111111");
  });

  test("an Apple Music /song/ link's album comes from iTunes Lookup", async () => {
    const { answer, requests } = await run(cases.appleSong);
    expect(answer).toMatchObject({
      status: "identified",
      step: 2,
      releaseGroupId: album.kindOfBlue,
    });
    expect(requests[0]).toBe("GET https://itunes.apple.com/lookup?id=268443097&country=fi");
  });

  test("Qobuz and Tidal track links go to manual entry with the link kept, after no request", async () => {
    for (const [testCase, service] of [
      [cases.qobuzTrack, "qobuz"],
      [cases.tidalTrack, "tidal"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const { answer, requests } = await run(testCase);
      expect(answer).toMatchObject({
        status: "unidentified",
        reason: unidentifiedReasons.trackOnly(service),
      });
      expect(requests).toEqual([]);
    }
  });
});

describe("step 4's rule (TS-41)", () => {
  test("a single of the same name doesn't count: Trust's Idéal is the album", async () => {
    const { answer } = await run(cases.appleSingle);
    expect(answer).toMatchObject({ status: "identified", step: 4, releaseGroupId: album.ideal });
  });

  test("two albums fit Dio's The Last in Line: both are offered, neither chosen", async () => {
    const { answer } = await run(cases.tidalTwoAlbums);
    expect(answer).toMatchObject({ status: "ambiguous", step: 4 });
    expect(answer.status === "ambiguous" && answer.candidates).toHaveLength(2);
  });

  test("the year rules out a different Nutcracker, and Apple's hints become the prefill", async () => {
    const { answer } = await run(cases.appleYear);
    expect(answer).toMatchObject({
      status: "unidentified",
      reason: unidentifiedReasons.notFound,
      prefill: { source: "itunes-lookup", values: { originalYear: 2026 } },
    });
    expect(answer.status === "unidentified" && answer.prefill?.values.title).not.toContain(
      "Remastered",
    );
  });

  test("a re-recording is its own album: Red (Taylor's Version), through requests A and B", async () => {
    const { answer, requests } = await run(cases.qobuzReRecording);
    expect(answer).toMatchObject({
      status: "identified",
      step: 4,
      releaseGroupId: album.redTaylorsVersion,
    });
    expect(to("www.qobuz.com", requests)).toEqual([
      "GET https://www.qobuz.com/robots.txt",
      "GET https://www.qobuz.com/fr-fr/album/-/zzzzzzzzzzzzz",
      "GET https://www.qobuz.com/fr-fr/album/red-taylors-version-taylor-swift/zzzzzzzzzzzzz",
    ]);
  });
});

describe("choices and manual entry (FR-02.3–FR-02.5, FR-02.9)", () => {
  test("a URL linked to two albums is a choice", async () => {
    const { answer } = await run(cases.twoAlbums);
    expect(answer).toMatchObject({
      status: "ambiguous",
      step: 2,
      candidates: [
        { releaseGroupId: album.randomAccessMemories, title: "Random Access Memories" },
        {
          releaseGroupId: "d34c6b11-6b3b-41ea-9fc6-44db1cc6577a",
          title: "Random Access Memories (drumless edition)",
        },
      ],
    });
  });

  test("a Tidal page whose hints fit nothing goes to manual entry, prefilled with nothing from the page", async () => {
    const { answer } = await run(cases.tidalUnmatched);
    expect(answer).toEqual({
      status: "unidentified",
      link: expect.objectContaining({ url: "https://tidal.com/album/348182612" }),
      reason: unidentifiedReasons.notFound,
    });
  });

  test("MusicBrainz busy through every retry fails as unavailable", async () => {
    const { answer } = await run(cases.busy);
    expect(answer).toMatchObject({
      status: "failed",
      failure: {
        code: "provider_unavailable",
        problem: { detail: expect.stringContaining("MusicBrainz") },
      },
    });
  });

  test("unsupported input fails as such", async () => {
    const { answer } = await run({
      name: "a playlist",
      input: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      spotify: true,
    });
    expect(answer).toMatchObject({ status: "failed", failure: { code: "unsupported_link" } });
  });
});

describe("agent captures (FR-10.5)", () => {
  test("an agent's Qobuz link: request A only, then a question for the agent", async () => {
    const { answer, requests } = await run(cases.qobuzAgentUnknown);
    expect(answer).toMatchObject({ status: "unidentified", reason: unidentifiedReasons.notFound });
    expect(to("www.qobuz.com", requests)).toEqual([
      "GET https://www.qobuz.com/robots.txt",
      "GET https://www.qobuz.com/fr-fr/album/-/0884977423006",
    ]);
  });

  test("request A's slug still lets step 2 identify an agent's Qobuz link", async () => {
    const { answer } = await run(cases.qobuzAgentSlug);
    expect(answer).toMatchObject({ status: "identified", step: 2, releaseGroupId: album.bleach });
  });

  test("an agent's Tidal link sends nothing to tidal.com", async () => {
    const { answer, requests } = await run(cases.tidalAgent);
    expect(answer.status).toBe("unidentified");
    expect(hosts(requests)).not.toContain("tidal.com");
    const app = await run(cases.tidalHints);
    expect(app.answer).toMatchObject({
      status: "identified",
      step: 4,
      releaseGroupId: album.brightFuture,
    });
  });
});

describe("Spotify values (TS-41)", () => {
  test("a Spotify track MusicBrainz lacks leaves no Spotify value in the answer or anything kept", async () => {
    const { answer, cache } = await run(cases.spotifyMissing);
    expect(answer.status).toBe("unidentified");
    const kept = JSON.stringify(cache.entries());
    const told = JSON.stringify(answer);
    for (const value of [
      "3333333333333333333333",
      "000000000017",
      "0000000000017",
      "00000000000017",
    ]) {
      expect(kept).not.toContain(value);
      expect(told).not.toContain(value);
    }
  });

  test("a Spotify track MusicBrainz has keeps its album id out of the answer", async () => {
    const { answer } = await run(cases.spotifyTrack);
    expect(JSON.stringify(answer)).not.toContain("0000000000000000000000");
  });

  test("with the bridge off, Spotify isn't asked", async () => {
    const { answer, requests } = await run(cases.spotifyOff);
    expect(answer.status).toBe("unidentified");
    expect(hosts(requests).some((host) => host.endsWith("spotify.com"))).toBe(false);
  });
});

describe("identificationOutcome (TS-27)", () => {
  const link = {
    service: "tidal",
    kind: "album",
    id: "348182612",
    albumId: "348182612",
    url: "https://tidal.com/album/348182612",
  } as const;
  const answers: Identification[] = [
    {
      status: "ambiguous",
      link,
      step: 4,
      candidates: [
        { releaseGroupId: "a", title: "A" },
        { releaseGroupId: "b", title: "B" },
      ],
    },
    {
      status: "unidentified",
      link,
      reason: unidentifiedReasons.notFound,
      prefill: {
        source: "itunes-lookup",
        values: { title: "Idéal", artistCredit: "Trust", originalYear: 1983 },
      },
    },
  ];

  test("choices and missing details ask for input, in a shape the API accepts", () => {
    const [ambiguous, unidentified] = answers.map(identificationOutcome);
    expect(outcomeSchema.parse(ambiguous)).toMatchObject({ status: "needs_input", need: "match" });
    expect(outcomeSchema.parse(unidentified)).toEqual({
      status: "needs_input",
      need: "details",
      candidates: [
        {
          service: "tidal",
          url: "https://tidal.com/album/348182612",
          reason: unidentifiedReasons.notFound,
          prefill: {
            source: "itunes-lookup",
            values: { title: "Idéal", artistCredit: "Trust", originalYear: 1983 },
          },
        },
      ],
    });
  });

  test("failures stay failures, and found albums have no outcome yet", async () => {
    const failed = (await run(cases.busy)).answer;
    expect(identificationOutcome(failed)).toMatchObject({
      status: "failed",
      code: "provider_unavailable",
    });
    const identified = (await run(cases.spotifyUrl)).answer;
    expect(identificationOutcome(identified)).toBeUndefined();
  });
});
