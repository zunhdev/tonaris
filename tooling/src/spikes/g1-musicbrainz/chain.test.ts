// The G1 spike's chain against a fake MusicBrainz: each step's outcomes, the 503 retry, and enrichment.

import { describe, expect, test } from "bun:test";

import { classify, runChain } from "./chain";
import { MusicBrainz } from "./musicbrainz";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const releaseRel = (id: string) => ({
  type: "streaming",
  "target-type": "release",
  release: { id, title: "T", barcode: "1", date: "2001", country: "XW" },
});

const liveRelease = {
  id: "r-live",
  title: "Live at Somewhere",
  barcode: "0123",
  "artist-credit": [{ name: "A", joinphrase: " & " }, { name: "B" }],
  "release-group": {
    id: "rg-live",
    "primary-type": "Album",
    "secondary-types": ["Live"],
    "first-release-date": "1976-03",
  },
  "cover-art-archive": { front: false },
  media: [
    {
      tracks: [
        {
          recording: {
            relations: [
              {
                type: "recorded at",
                "target-type": "place",
                begin: "1975-01-24",
                end: "1975-01-24",
              },
            ],
          },
        },
        {
          recording: {
            relations: [
              {
                type: "recorded at",
                "target-type": "event",
                event: { "life-span": { begin: "1975-01-25", end: "1975-01-25" } },
              },
            ],
          },
        },
      ],
    },
  ],
};

/** Answers MusicBrainz by URL; the first request to each URL in `busy` gets a 503. */
function fakeMusicBrainz(busy: readonly string[] = []) {
  const refused = new Set<string>();
  return async (href: string) => {
    const url = new URL(href);
    if (url.hostname === "coverartarchive.org") return new Response(null, { status: 307 });
    if (url.hostname === "www.qobuz.com") {
      const id = url.pathname.split("/").at(-1);
      return new Response(null, {
        status: 301,
        headers: { location: `/us-en/album/a-slug/${id}` },
      });
    }
    if (busy.some((b) => href.includes(b)) && !refused.has(href)) {
      refused.add(href);
      return new Response("slow down", { status: 503, headers: { "retry-after": "0" } });
    }
    const resources = url.searchParams.getAll("resource");
    if (url.pathname.endsWith("/url")) {
      const stored = "https://www.qobuz.com/gb-en/album/a-slug/storeonly0001";
      if (resources.includes(stored)) {
        return json({ urls: [{ resource: stored, relations: [releaseRel("r-store")] }] });
      }
      if (resources.some((r) => r.includes("/album/ONE"))) {
        return json({ resource: resources[0], relations: [releaseRel("r-live")] });
      }
      if (resources.some((r) => r.includes("/album/MANY"))) {
        return json({
          urls: [{ resource: resources[0], relations: [releaseRel("r1"), releaseRel("r2")] }],
        });
      }
      return new Response(null, { status: 404 });
    }
    if (url.pathname.endsWith("/release")) {
      // A barcode search: MusicBrainz stores the UPC-A, without the EAN's leading 0.
      return json({
        releases: [
          { id: "r-upc", title: "T", barcode: "602537347131", "release-group": { id: "rg" } },
        ],
      });
    }
    if (url.pathname.endsWith("/release/r-live")) return json(liveRelease);
    if (url.pathname.includes("/release/")) return json({ id: "r-upc", title: "T" });
    throw new Error(`unexpected ${href}`);
  };
}

const client = (busy?: readonly string[]) =>
  new MusicBrainz({ fetch: fakeMusicBrainz(busy), sleep: async () => {}, minIntervalMs: 0 });

describe("runChain", () => {
  test("decides each link at the first step that can", async () => {
    const mb = client();
    const results = await runChain(
      [
        "https://open.spotify.com/album/ONE0000000000000000000",
        "https://open.spotify.com/album/ONE0000000000000000000?si=again",
        "https://music.apple.com/de/album/x/123?i=4",
        "https://open.spotify.com/album/MANY000000000000000000",
        "https://open.qobuz.com/album/0602537347131",
        "https://open.spotify.com/track/4vLYewWIvqHfKtJDk8c8tq",
        "https://open.qobuz.com/track/123",
        "https://www.youtube.com/watch?v=x",
      ],
      mb,
      { fetch: fakeMusicBrainz() },
    );
    expect(results.map((r) => [r.outcome, r.step])).toEqual([
      ["confident", 2],
      ["existing", 1],
      ["pending", undefined],
      ["needs_input", 2],
      ["confident", 3],
      ["pending", undefined],
      ["unresolved", undefined],
      ["unsupported", 0],
    ]);
    expect(results[3]?.attempts[0]?.candidates?.map((c) => c.id)).toEqual(["r1", "r2"]);
    expect(results[4]?.attempts.at(-1)).toMatchObject({
      step: 3,
      tried: ["0602537347131", "602537347131"],
      matched: ["602537347131"],
    });
  });

  test("measures enrichment: classification, artwork fallback and recording dates (TS-45, TS-46)", async () => {
    const [result] = await runChain(
      ["https://open.spotify.com/album/ONE0000000000000000000"],
      client(),
      {
        fetch: fakeMusicBrainz(),
      },
    );
    expect(result?.release).toMatchObject({
      artistCredit: "A & B",
      releaseType: "album",
      isLive: true,
      firstReleaseDate: "1976-03",
      coverFront: false,
      releaseGroupCover: true,
      recordingDates: {
        recordings: 2,
        withRelationshipDates: 1,
        withEventDatesOnly: 1,
        span: ["1975-01-24", "1975-01-25"],
      },
    });
  });

  test("looks up a Qobuz open link's store slug, and tells a stored form from the canonical URL", async () => {
    const [result] = await runChain(["https://open.qobuz.com/album/storeonly0001"], client(), {
      fetch: fakeMusicBrainz(),
    });
    expect(result).toMatchObject({ outcome: "confident", step: 2, releaseId: "r-store" });
    expect(result?.attempts[0]).toMatchObject({ canonicalMatched: false, qobuzSlug: "a-slug" });
  });

  test("retries after a 503 and counts it", async () => {
    const mb = client(["/url"]);
    const [result] = await runChain(["https://open.spotify.com/album/ONE0000000000000000000"], mb);
    expect(result?.outcome).toBe("confident");
    expect(mb.requests[0]).toMatchObject({ status: 200, retries: 1 });
  });
});

describe("classify (TS-45)", () => {
  test("maps MusicBrainz types; singles stay Unclassified", () => {
    expect(classify("Album", [])).toEqual({ releaseType: "album", isLive: false });
    expect(classify("EP", ["Live"])).toEqual({ releaseType: "ep", isLive: true });
    expect(classify("Album", ["Compilation"])).toEqual({
      releaseType: "compilation",
      isLive: false,
    });
    expect(classify("Single", [])).toEqual({ releaseType: null, isLive: false });
  });
});
