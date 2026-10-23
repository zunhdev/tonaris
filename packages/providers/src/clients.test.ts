// iTunes Lookup, Spotify and the store pages on scripted answers and a simulated clock (TS-41).

import { describe, expect, test } from "bun:test";

import { ItunesLookup, itunesCacheMs } from "./itunes";
import { memoryCache, ProviderUnavailableError } from "./provider-cache";
import type { SafeFetchInit } from "./safe-fetch";
import { Spotify } from "./spotify";
import { extractQobuzHints, extractTidalHints, robotsAllows, StorePages } from "./store-pages";

type Sent = { at: number; url: string; init: SafeFetchInit };

/** Shared options for a client: a cache, a simulated clock, and answers from `answer`, recording each request. */
function scripted(answer: (url: string, sent: Sent[]) => Response) {
  let clock = Date.UTC(2026, 9, 24, 12);
  const sent: Sent[] = [];
  const cache = memoryCache();
  return {
    sent,
    cache,
    advance: (ms: number) => {
      clock += ms;
    },
    options: {
      cache,
      now: () => clock,
      sleep: async (ms: number) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        clock += ms;
      },
      fetch: async (url: string, init: SafeFetchInit) => {
        sent.push({ at: clock, url, init });
        return answer(url, sent);
      },
    },
  };
}

const gaps = (sent: Sent[]) =>
  sent.slice(1).map((request, index) => request.at - (sent[index]?.at ?? 0));

const appleAlbum = {
  wrapperType: "collection",
  collectionId: 254249657,
  collectionName: "Idéal",
  artistName: "Trust",
  releaseDate: "1983-01-01T08:00:00Z",
  trackCount: 9,
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
  collectionViewUrl: "https://music.apple.com/us/album/id%C3%A9al/254249657",
};

describe("ItunesLookup (TS-41)", () => {
  test("lookups start 3 s apart, and keep only the hints, for a day", async () => {
    const { options, sent, cache, advance } = scripted(() =>
      Response.json({ resultCount: 1, results: [appleAlbum] }),
    );
    const itunes = new ItunesLookup(options);
    const ids = Array.from({ length: 10 }, (_, index) => String(254249657 + index));
    await Promise.all(ids.map((id) => itunes.album(id, ["us"])));
    expect(gaps(sent).every((gap) => gap >= 3_000)).toBe(true);
    expect(await itunes.album("254249657", ["us"])).toEqual({
      albumId: "254249657",
      title: "Idéal",
      artist: "Trust",
      date: "1983-01-01",
      trackCount: 9,
    });
    expect(sent).toHaveLength(10);
    expect(JSON.stringify(cache.entries())).not.toContain("mzstatic");
    advance(itunesCacheMs + 1);
    await itunes.album("254249657", ["us"]);
    expect(sent).toHaveLength(11);
  });

  test("storefronts are tried in turn, and a song names its album", async () => {
    const { options, sent } = scripted((url) =>
      url.includes("country=fi")
        ? Response.json({ resultCount: 0, results: [] })
        : Response.json({
            resultCount: 1,
            results: [
              {
                wrapperType: "track",
                collectionId: 268443092,
                collectionName: "Kind of Blue",
                artistName: "Miles Davis",
                collectionArtistName: "Miles Davis",
                releaseDate: "1959-08-17T07:00:00Z",
                trackCount: 6,
              },
            ],
          }),
    );
    const itunes = new ItunesLookup(options);
    expect(await itunes.songAlbum("268443097", ["fi", "us"])).toMatchObject({
      albumId: "268443092",
      title: "Kind of Blue",
    });
    expect(sent.map(({ url }) => url)).toEqual([
      "https://itunes.apple.com/lookup?id=268443097&country=fi",
      "https://itunes.apple.com/lookup?id=268443097&country=us",
    ]);
  });

  test("a failed lookup is unavailable", async () => {
    const { options } = scripted(() => new Response(null, { status: 503 }));
    const error = await new ItunesLookup(options)
      .album("1", ["us"])
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error).toMatchObject({ provider: "itunes" });
  });
});

const throttled = () => new Response(null, { status: 429, headers: { "retry-after": "7" } });
const token = () =>
  Response.json({ access_token: "token", token_type: "Bearer", expires_in: 3_600 });
const albumId = "4m2880jivSbbyEGAKfITCa";

describe("Spotify (TS-41)", () => {
  test("one token for many calls, and nothing kept between them", async () => {
    const { options, sent } = scripted((url) =>
      url.includes("/token") ? token() : Response.json({ external_ids: { upc: "886443927087" } }),
    );
    const spotify = new Spotify({ clientId: "id", clientSecret: "secret", ...options });
    expect(await spotify.album(albumId)).toEqual({ upc: "886443927087" });
    expect(await spotify.album(albumId)).toEqual({ upc: "886443927087" });
    expect(sent.map(({ url }) => url)).toEqual([
      "https://accounts.spotify.com/api/token",
      `https://api.spotify.com/v1/albums/${albumId}`,
      `https://api.spotify.com/v1/albums/${albumId}`,
    ]);
    expect(new Headers(sent[0]?.init.headers).get("authorization")).toBe(
      `Basic ${btoa("id:secret")}`,
    );
  });

  test("a track names its album; an unknown one names none", async () => {
    const { options } = scripted((url) =>
      url.includes("/token")
        ? token()
        : url.endsWith("0000000000000000000000")
          ? new Response(null, { status: 404 })
          : Response.json({ album: { id: albumId } }),
    );
    const spotify = new Spotify({ clientId: "id", clientSecret: "secret", ...options });
    expect(await spotify.parentAlbum("1111111111111111111111")).toBe(albumId);
    expect(await spotify.parentAlbum("0000000000000000000000")).toBeUndefined();
  });

  test("429s are waited out as Retry-After asks, then give up without naming an id", async () => {
    const once = scripted((url, sent) =>
      url.includes("/token")
        ? token()
        : sent.length === 2
          ? throttled()
          : Response.json({ album: { id: albumId } }),
    );
    await new Spotify({ clientId: "id", clientSecret: "secret", ...once.options }).parentAlbum(
      albumId,
    );
    expect(gaps(once.sent).at(-1)).toBeGreaterThanOrEqual(7_000);

    const always = scripted((url) => (url.includes("/token") ? token() : throttled()));
    const error = await new Spotify({ clientId: "id", clientSecret: "secret", ...always.options })
      .album(albumId)
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ provider: "spotify" });
    expect(String(error)).not.toContain(albumId);
  });

  test("a refused token is fetched again once", async () => {
    const { options, sent } = scripted((url, requests) =>
      url.includes("/token")
        ? token()
        : requests.length === 2
          ? new Response(null, { status: 401 })
          : Response.json({ external_ids: {} }),
    );
    expect(
      await new Spotify({ clientId: "id", clientSecret: "secret", ...options }).album(albumId),
    ).toEqual({});
    expect(sent.filter(({ url }) => url.includes("/token"))).toHaveLength(2);
  });
});

const page = (blocks: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(blocks)}</script></head></html>`;

describe("store pages: hints (TS-41)", () => {
  test("Qobuz: the MusicAlbum name, the Product's brand and the date", () => {
    expect(
      extractQobuzHints(
        page([
          {
            "@type": "Product",
            name: "Red",
            brand: { name: "Taylor Swift &amp; more" },
            releaseDate: "2012-10-22",
          },
          {
            "@type": "MusicAlbum",
            name: "Red (Taylor&#x27;s Version)",
            datePublished: "2021-11-12",
          },
        ]),
      ),
    ).toEqual({
      title: "Red (Taylor's Version)",
      artist: "Taylor Swift & more",
      date: "2021-11-12",
    });
    expect(extractQobuzHints("<html></html>")).toBeUndefined();
  });

  test("Tidal: the MusicAlbum name, its artists and its date", () => {
    expect(
      extractTidalHints(
        page({
          "@type": "MusicAlbum",
          name: "Bright Future",
          byArtist: [{ name: "Adrianne Lenker" }, { name: "Someone" }],
          datePublished: "2024-03-22T00:00:00Z",
        }),
      ),
    ).toEqual({ title: "Bright Future", artist: "Adrianne Lenker, Someone", date: "2024-03-22" });
  });

  test("robots.txt: the named group, else *, and the longest rule", () => {
    const robots =
      "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /commande/\nAllow: /\n";
    expect(robotsAllows(robots, "Tonaris", "/fr-fr/album/x/0")).toBe(true);
    expect(robotsAllows(robots, "GPTBot", "/fr-fr/album/x/0")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /album/\n", "Tonaris", "/album/0")).toBe(false);
    expect(
      robotsAllows(
        "User-agent: Tonaris\nAllow: /album/\nUser-agent: *\nDisallow: /\n",
        "Tonaris",
        "/album/0",
      ),
    ).toBe(true);
  });
});

const tidalAlbum = page({
  "@type": "MusicAlbum",
  name: "Bright Future",
  byArtist: { name: "Adrianne Lenker" },
  datePublished: "2024-03-22",
});

describe("store pages: requests (TS-41)", () => {
  test("robots.txt is read once a day, and a disallow stops every page request", async () => {
    let robots = "User-agent: *\nDisallow: /album/\n";
    const { options, sent, advance } = scripted((url) =>
      url.endsWith("robots.txt")
        ? new Response(robots)
        : new Response(tidalAlbum, { headers: { "content-type": "text/html" } }),
    );
    const pages = new StorePages(options);
    expect(await pages.tidalHints("348182611")).toBeUndefined();
    expect(await pages.tidalHints("348182611")).toBeUndefined();
    expect(sent.map(({ url }) => url)).toEqual(["https://tidal.com/robots.txt"]);
    robots = "User-agent: *\nAllow: /\n";
    advance(86_400_000 + 1);
    expect(await pages.tidalHints("348182611")).toMatchObject({ title: "Bright Future" });
    expect(sent.map(({ url }) => url)).toEqual([
      "https://tidal.com/robots.txt",
      "https://tidal.com/robots.txt",
      "https://tidal.com/album/348182611",
    ]);
  });

  test("Tidal: one redirect to the same album is followed, a 404 has no hints, a 500 is unavailable", async () => {
    const answers: Record<string, Response> = {};
    const { options, sent } = scripted((url) =>
      url.endsWith("robots.txt")
        ? new Response("User-agent: *\nAllow: /\n")
        : (answers[url] ?? new Response(null, { status: 404 })),
    );
    const pages = new StorePages(options);
    answers["https://tidal.com/album/1"] = new Response(null, {
      status: 301,
      headers: { location: "/browse/album/1" },
    });
    answers["https://tidal.com/browse/album/1"] = new Response(tidalAlbum);
    expect(await pages.tidalHints("1")).toMatchObject({ artist: "Adrianne Lenker" });
    answers["https://tidal.com/album/2"] = new Response(null, {
      status: 301,
      headers: { location: "/album/3" },
    });
    expect(await pages.tidalHints("2")).toBeUndefined();
    expect(await pages.tidalHints("4")).toBeUndefined();
    answers["https://tidal.com/album/5"] = new Response(null, { status: 500 });
    expect(await pages.tidalHints("5").catch((caught: unknown) => caught)).toMatchObject({
      provider: "tidal",
    });
    expect(
      gaps(sent.filter(({ url }) => !url.endsWith("robots.txt"))).every((gap) => gap >= 1_000),
    ).toBe(true);
  });

  test("Qobuz's request A reads only Location, or the page when allowed", async () => {
    const answers: Record<string, () => Response> = {
      "https://www.qobuz.com/robots.txt": () =>
        new Response("User-agent: *\nDisallow: /commande/\n"),
      "https://www.qobuz.com/fr-fr/album/-/abc": () =>
        new Response("<html>a page</html>", {
          status: 301,
          headers: { location: "/fr-fr/album/the-slug/abc" },
        }),
      "https://www.qobuz.com/fr-fr/album/-/def": () => new Response("<html>the page itself</html>"),
    };
    const { options, sent } = scripted(
      (url) => answers[url]?.() ?? new Response(null, { status: 404 }),
    );
    const pages = new StorePages(options);
    expect(await pages.qobuzAddress("abc", { readPage: true })).toEqual({ slug: "the-slug" });
    expect(await pages.qobuzAddress("def", { readPage: false })).toEqual({ slug: "-" });
    expect(await pages.qobuzAddress("def", { readPage: true })).toEqual({
      slug: "-",
      page: "<html>the page itself</html>",
    });
    expect(await pages.qobuzAddress("ghi", { readPage: true })).toBeUndefined();
    expect(sent.every(({ url }) => url.startsWith("https://www.qobuz.com/"))).toBe(true);
    expect(
      sent.every(({ init }) => init.redirect === "manual" || init.redirect === undefined),
    ).toBe(true);
  });

  test("Qobuz's request B follows one redirect to the same album, and no other", async () => {
    const qobuzAlbum = page([
      { "@type": "Product", name: "Bleach", brand: { name: "Nirvana" } },
      { "@type": "MusicAlbum", name: "Bleach", datePublished: "1989-06-01" },
    ]);
    const answers: Record<string, () => Response> = {
      "https://www.qobuz.com/robots.txt": () => new Response("User-agent: *\nAllow: /\n"),
      "https://www.qobuz.com/gb-en/album/old-slug/tietg8e0jjdh8": () =>
        new Response(null, {
          status: 301,
          headers: { location: "/gb-en/album/bleach-nirvana/tietg8e0jjdh8" },
        }),
      "https://www.qobuz.com/gb-en/album/bleach-nirvana/tietg8e0jjdh8": () =>
        new Response(qobuzAlbum),
      "https://www.qobuz.com/gb-en/album/x/other": () =>
        new Response(null, { status: 302, headers: { location: "https://example.com/" } }),
    };
    const { options } = scripted((url) => answers[url]?.() ?? new Response(null, { status: 404 }));
    const pages = new StorePages(options);
    expect(await pages.qobuzHints("tietg8e0jjdh8", "old-slug", "gb-en")).toEqual({
      title: "Bleach",
      artist: "Nirvana",
      date: "1989-06-01",
    });
    expect(await pages.qobuzHints("other", "x", "gb-en")).toBeUndefined();
  });
});
