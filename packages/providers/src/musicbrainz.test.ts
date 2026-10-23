// The MusicBrainz client on a simulated clock (TS-41): requests go through the real `safeFetch` to a scripted
// connection, so what is sent, and when, is what MusicBrainz would see.

import { describe, expect, test } from "bun:test";

import { MusicBrainz, providerCacheMs, type UrlTarget } from "./musicbrainz";
import { memoryCache, ProviderUnavailableError } from "./provider-cache";
import { createSafeFetch, userAgent } from "./safe-fetch";

type Sent = { at: number; url: URL; method: string; headers: Headers };

/** A client whose clock is simulated and whose connections answer from `answer`, recording each request. */
function harness(answer: (url: URL, sent: Sent[]) => Response | Promise<Response>) {
  let clock = Date.UTC(2026, 9, 24, 12);
  const sent: Sent[] = [];
  const cache = memoryCache();
  const fetch = createSafeFetch({
    resolve: async () => [{ address: "93.184.215.14", family: 4 }],
    connect: async (url, _address, init) => {
      const request = {
        at: clock,
        url,
        method: init.method ?? "GET",
        headers: new Headers(init.headers),
      };
      sent.push(request);
      return answer(url, sent);
    },
  });
  const musicBrainz = new MusicBrainz({
    cache,
    fetch,
    now: () => clock,
    // A real yield, so answers in flight are handled while a turn sleeps, as they would be.
    sleep: async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      clock += ms;
    },
  });
  return {
    musicBrainz,
    cache,
    sent,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
const notFound = () =>
  json({ error: "Not Found" }, { status: 404, headers: { "content-type": "application/json" } });
const busy = (retryAfter?: string) =>
  new Response("busy", {
    status: 503,
    ...(retryAfter ? { headers: { "retry-after": retryAfter } } : {}),
  });

const releaseGroupIds = Array.from(
  { length: 40 },
  (_, index) =>
    `aa997ea0-2936-40bd-884d-${(0x3af8a0e06400 + index).toString(16).padStart(12, "0")}`,
);

/** Gaps between consecutive request starts, in milliseconds. */
const gaps = (sent: Sent[]) =>
  sent.slice(1).map((request, index) => request.at - (sent[index]?.at ?? 0));

describe("the queue (TS-41)", () => {
  test("a batch of 50 lookups starts a second apart, with the User-Agent, and asks for duplicates once", async () => {
    const { musicBrainz, sent } = harness((url) =>
      json({ id: url.pathname.split("/").at(-1), title: "Album" }),
    );
    // 40 albums, 10 of them asked for twice.
    const batch = [...releaseGroupIds, ...releaseGroupIds.slice(0, 10)];
    const answers = await Promise.all(
      batch.map((id) => musicBrainz.lookup("release-group", id, ["artist-credits"])),
    );
    expect(answers[45]).toEqual({ id: releaseGroupIds[5], title: "Album" });
    expect(sent).toHaveLength(40);
    expect(gaps(sent).every((gap) => gap >= 1_000)).toBe(true);
    expect(sent.every(({ headers }) => headers.get("user-agent") === userAgent)).toBe(true);
    expect(userAgent).toContain("( https://");
    expect(sent[0]?.url.href).toBe(
      `https://musicbrainz.org/ws/2/release-group/${releaseGroupIds[0]}?inc=artist-credits&fmt=json`,
    );
  });

  test("the same batch again sends nothing within 7 days, and asks again after", async () => {
    const { musicBrainz, sent, advance } = harness((url) =>
      json({ id: url.pathname.split("/").at(-1) }),
    );
    const batch = () =>
      Promise.all(releaseGroupIds.map((id) => musicBrainz.lookup("release-group", id, [])));
    const first = await batch();
    advance(providerCacheMs - 60_000);
    expect(await batch()).toEqual(first);
    expect(sent).toHaveLength(40);
    advance(120_000);
    await musicBrainz.lookup("release-group", releaseGroupIds[0] ?? "", []);
    expect(sent).toHaveLength(41);
  });

  test("an unknown MBID answers null, kept like any answer; an invalid one is never sent", async () => {
    const { musicBrainz, sent } = harness(() => notFound());
    const id = releaseGroupIds[0] ?? "";
    expect(await musicBrainz.lookup("release", id, ["release-groups"])).toBeNull();
    expect(await musicBrainz.lookup("release", id, ["release-groups"])).toBeNull();
    expect(sent).toHaveLength(1);
    const invalid = await musicBrainz
      .lookup("release", "../url?resource=x", [])
      .catch((caught: unknown) => caught);
    expect(invalid).toBeInstanceOf(Error);
    expect(sent).toHaveLength(1);
  });

  test("searches are never kept", async () => {
    const { musicBrainz, sent } = harness(() => json({ releases: [] }));
    await musicBrainz.search("release", 'release:"Discovery" AND artist:"Daft Punk"');
    await musicBrainz.search("release", 'release:"Discovery" AND artist:"Daft Punk"');
    expect(sent).toHaveLength(2);
    expect(sent[0]?.url.searchParams.get("query")).toBe(
      'release:"Discovery" AND artist:"Daft Punk"',
    );
  });
});

describe("URL lookups (TS-41 step 2)", () => {
  const spotify = "https://open.spotify.com/album/32NZSslCL03dkXyILrrbGe";
  const tidal = "https://tidal.com/album/348182611";
  const linked = {
    urls: [
      {
        resource: spotify,
        relations: [
          {
            "target-type": "release",
            release: { id: "683dd246-f69a-42aa-9e39-4de5f0b88e34", title: "doing" },
          },
          {
            "target-type": "release_group",
            release_group: { id: "aa997ea0-2936-40bd-884d-3af8a0e064dc", title: "doing" },
          },
          { "target-type": "artist", artist: { id: "x", name: "y" } },
        ],
      },
    ],
  };
  const targets: UrlTarget[] = [
    { kind: "release", id: "683dd246-f69a-42aa-9e39-4de5f0b88e34", title: "doing" },
    { kind: "release-group", id: "aa997ea0-2936-40bd-884d-3af8a0e064dc", title: "doing" },
  ];

  test("every form in one request, and each form's releases and release groups", async () => {
    const { musicBrainz, sent } = harness(() => json(linked));
    const answer = await musicBrainz.urls([spotify, tidal], { cacheMisses: true });
    expect(answer).toEqual(
      new Map([
        [spotify, targets],
        [tidal, []],
      ]),
    );
    expect(sent[0]?.url.searchParams.getAll("resource")).toEqual([spotify, tidal]);
    expect(sent[0]?.url.searchParams.get("inc")).toBe("release-rels release-group-rels");
    expect(await musicBrainz.urls([spotify, tidal], { cacheMisses: true })).toEqual(answer);
    expect(sent).toHaveLength(1);
  });

  test("a single unknown URL is a 404, and an empty answer", async () => {
    const { musicBrainz } = harness(() => notFound());
    expect(await musicBrainz.urls([tidal], { cacheMisses: true })).toEqual(new Map([[tidal, []]]));
  });

  test("a Spotify-derived URL MusicBrainz lacks leaves nothing behind", async () => {
    const { musicBrainz, cache, sent } = harness(() => json({ urls: [] }));
    await musicBrainz.urls([spotify], { cacheMisses: false });
    await musicBrainz.urls([spotify], { cacheMisses: false });
    expect(cache.size()).toBe(0);
    expect(sent).toHaveLength(2);
  });

  test("a Spotify-derived URL MusicBrainz has is kept, and answers next time", async () => {
    const { musicBrainz, cache, sent } = harness(() => json(linked));
    await musicBrainz.urls([spotify, `${spotify}?si=x`], { cacheMisses: false });
    expect(await musicBrainz.urls([spotify, `${spotify}?si=x`], { cacheMisses: false })).toEqual(
      new Map([
        [spotify, targets],
        [`${spotify}?si=x`, []],
      ]),
    );
    expect(cache.size()).toBe(1);
    expect(sent).toHaveLength(1);
  });
});

describe("barcode searches (TS-41 step 3)", () => {
  const forms = ["886443927087", "00886443927087"];
  const found = {
    releases: [
      {
        id: "5000a285-b67e-4cfc-b54b-2b98f1810d2e",
        title: "Random Access Memories",
        barcode: "886443927087",
        "release-group": { id: "aa997ea0-2936-40bd-884d-3af8a0e064dc" },
      },
      // A near miss the search engine scored: only exact barcodes count.
      {
        id: "6000a285-b67e-4cfc-b54b-2b98f1810d2e",
        title: "Random Access Memories",
        barcode: "886443927088",
        "release-group": { id: "aa997ea0-2936-40bd-884d-3af8a0e064dc" },
      },
    ],
  };
  const exact = [
    {
      id: "5000a285-b67e-4cfc-b54b-2b98f1810d2e",
      title: "Random Access Memories",
      barcode: "886443927087",
      releaseGroupId: "aa997ea0-2936-40bd-884d-3af8a0e064dc",
    },
  ];

  test("every form in one search, exact barcodes only", async () => {
    const { musicBrainz, sent } = harness(() => json(found));
    expect(await musicBrainz.barcodes(forms, { cacheMisses: true })).toEqual(exact);
    expect(sent[0]?.url.searchParams.get("query")).toBe(
      "barcode:886443927087 OR barcode:00886443927087",
    );
  });

  test("a Spotify barcode MusicBrainz lacks leaves nothing behind", async () => {
    const { musicBrainz, cache, sent } = harness(() => json({ releases: [] }));
    expect(await musicBrainz.barcodes(forms, { cacheMisses: false })).toEqual([]);
    expect(await musicBrainz.barcodes(forms, { cacheMisses: false })).toEqual([]);
    expect(cache.size()).toBe(0);
    expect(sent).toHaveLength(2);
  });

  test("a Spotify barcode MusicBrainz has is kept under its own barcode only, and answers next time", async () => {
    const { musicBrainz, cache, sent } = harness(() => json(found));
    await musicBrainz.barcodes(forms, { cacheMisses: false });
    expect(await musicBrainz.barcodes(forms, { cacheMisses: false })).toEqual(exact);
    expect(cache.size()).toBe(1);
    expect([
      ...(await cache.get(["musicbrainz:barcode:886443927087"], new Date(0))).keys(),
    ]).toEqual(["musicbrainz:barcode:886443927087"]);
    expect(sent).toHaveLength(1);
  });

  test("other barcodes' misses are kept", async () => {
    const { musicBrainz, cache, sent } = harness(() => json({ releases: [] }));
    await musicBrainz.barcodes(["0884977423006", "884977423006"], { cacheMisses: true });
    await musicBrainz.barcodes(["0884977423006", "884977423006"], { cacheMisses: true });
    expect(cache.size()).toBe(2);
    expect(sent).toHaveLength(1);
  });
});

describe("a busy MusicBrainz (TS-41)", () => {
  const id = releaseGroupIds[0] ?? "";

  test("two 503s, then an answer: the waits grow, and Retry-After is honoured", async () => {
    const { musicBrainz, sent } = harness((_url, requests) =>
      requests.length === 1 ? busy() : requests.length === 2 ? busy("5") : json({ id }),
    );
    expect(await musicBrainz.lookup("release-group", id, [])).toEqual({ id });
    expect(gaps(sent)).toEqual([1_000, 5_000]);
  });

  test("without Retry-After, the waits double", async () => {
    const { musicBrainz, sent } = harness((_url, requests) =>
      requests.length <= 3 ? busy() : json({ id }),
    );
    await musicBrainz.lookup("release-group", id, []);
    expect(gaps(sent)).toEqual([1_000, 2_000, 4_000]);
  });

  test("a busy answer holds back every lookup waiting, not just its own", async () => {
    const { musicBrainz, sent } = harness((url, requests) =>
      requests.length === 1 ? busy("10") : json({ id: url.pathname.split("/").at(-1) }),
    );
    const [first, second] = [releaseGroupIds[0] ?? "", releaseGroupIds[1] ?? ""];
    await Promise.all([
      musicBrainz.lookup("release-group", first, []),
      musicBrainz.lookup("release-group", second, []),
    ]);
    const start = sent[0]?.at ?? 0;
    expect(sent.slice(1).every((request) => request.at - start >= 10_000)).toBe(true);
    expect(gaps(sent.slice(1))).toEqual([1_000]);
  });

  test("502s, 504s and failed connections are retried too", async () => {
    const { musicBrainz, sent } = harness((_url, requests) => {
      if (requests.length === 1) return new Response(null, { status: 502 });
      if (requests.length === 2) throw new TypeError("ConnectionRefused");
      if (requests.length === 3) return new Response(null, { status: 504 });
      return json({ id });
    });
    expect(await musicBrainz.lookup("release-group", id, [])).toEqual({ id });
    expect(sent).toHaveLength(4);
  });

  test("when it stays busy, the lookup fails as unavailable, naming no barcode", async () => {
    const { musicBrainz, sent } = harness(() => busy());
    const error = await musicBrainz
      .barcodes(["886443927087"], { cacheMisses: false })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({ provider: "musicbrainz" });
    expect(String(error)).toContain("/ws/2/release");
    expect(String(error)).not.toContain("886443927087");
    expect(sent).toHaveLength(5);
  });

  test("other answers fail at once", async () => {
    const { musicBrainz, sent } = harness(() => new Response("bad", { status: 400 }));
    const error = await musicBrainz
      .lookup("release-group", id, [])
      .catch((caught: unknown) => caught);
    expect(String(error)).toContain("MusicBrainz answered 400 for /ws/2/release-group/");
    expect(sent).toHaveLength(1);
  });
});

describe("the Cover Art Archive", () => {
  const id = "aa997ea0-2936-40bd-884d-3af8a0e064dc";
  const front = `https://coverartarchive.org/release-group/${id}/front-500`;

  test("a front is its stable address, asked once, without waiting for MusicBrainz's queue", async () => {
    const { musicBrainz, sent } = harness(
      () =>
        new Response(null, {
          status: 307,
          headers: { location: "https://archive.org/download/mbid-x/mbid-x-1_thumb500.jpg" },
        }),
    );
    expect(await musicBrainz.releaseGroupFront(id)).toBe(front);
    expect(await musicBrainz.releaseGroupFront(id)).toBe(front);
    expect(sent.map(({ url, method }) => [url.href, method])).toEqual([[front, "HEAD"]]);
  });

  test("no front", async () => {
    const { musicBrainz } = harness(() => new Response(null, { status: 404 }));
    expect(await musicBrainz.releaseGroupFront(id)).toBeNull();
  });

  test("a failing archive is unavailable", async () => {
    const { musicBrainz } = harness(() => new Response(null, { status: 503 }));
    const error = await musicBrainz.releaseGroupFront(id).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ provider: "coverartarchive" });
  });
});
