// The Tidal store-page client against a fake tidal.com: the facts read from a page, the request each link takes,
// and robots.txt. The pages here are made up, not Tidal's HTML.

import { describe, expect, test } from "bun:test";

import { parseLink } from "../g1-musicbrainz/links";
import { extractTidalHints, Tidal } from "./tidal";

const page = (album: Record<string, unknown>) => `<html><head>
<meta name="robots" content="noai, noimageai" />
<script type="application/ld+json">${JSON.stringify({ "@type": "MusicAlbum", ...album })}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"TIDAL"}]}</script>
</head></html>`;

const album = {
  name: "Night Songs (Deluxe Edition)",
  byArtist: [{ "@type": "MusicGroup", name: "The Testers &amp; Friends" }, { name: "Guest" }],
  datePublished: "1999-03-01T00:00:00.000Z",
};

describe("extractTidalHints", () => {
  test("reads the album's name, its artists and the day it was published", () => {
    expect(extractTidalHints(page(album))).toEqual({
      title: "Night Songs (Deluxe Edition)",
      fullTitle: "Night Songs (Deluxe Edition)",
      artist: "The Testers & Friends, Guest",
      date: "1999-03-01",
    });
  });

  test("takes a single artist as well as a list", () => {
    expect(extractTidalHints(page({ ...album, byArtist: { name: "Solo" } }))?.artist).toBe("Solo");
  });

  test("gives nothing without a title, an artist or a full date", () => {
    expect(extractTidalHints(page({ ...album, name: "" }))).toBeUndefined();
    expect(extractTidalHints(page({ ...album, byArtist: [] }))).toBeUndefined();
    expect(extractTidalHints(page({ ...album, datePublished: "1999" }))).toBeUndefined();
    expect(extractTidalHints("<html></html>")).toBeUndefined();
  });
});

function store(answers: Record<string, { status: number; location?: string; body?: string }>) {
  const asked: string[] = [];
  const tidal = new Tidal({
    minIntervalMs: 0,
    fetch: async (url, init) => {
      asked.push(url);
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get("user-agent")).toStartWith("Tonaris/");
      const answer = answers[new URL(url).pathname] ?? { status: 404 };
      return new Response(answer.body ?? "", {
        status: answer.status,
        headers: answer.location ? { location: answer.location } : {},
      });
    },
  });
  return { tidal, asked };
}

const linkOf = (input: string) => {
  const parsed = parseLink(input);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.link;
};

describe("Tidal.album", () => {
  test("one request to the album's page on tidal.com, whatever form the link took", async () => {
    const { tidal, asked } = store({ "/album/123": { status: 200, body: page(album) } });
    const result = await tidal.album(linkOf("https://listen.tidal.com/album/123"));
    expect(result).toMatchObject({ requests: 1, hints: { title: "Night Songs (Deluxe Edition)" } });
    expect(asked).toEqual(["https://tidal.com/album/123"]);
  });

  test("follows a redirect to the same album once, and no other", async () => {
    const { tidal, asked } = store({
      "/album/123": { status: 301, location: "/browse/album/123" },
      "/browse/album/123": { status: 200, body: page(album) },
      "/album/456": { status: 302, location: "https://example.com/album/456" },
      "/album/789": { status: 301, location: "/album/999" },
    });
    expect(await tidal.album(linkOf("https://tidal.com/album/123"))).toMatchObject({ requests: 2 });
    expect(await tidal.album(linkOf("https://tidal.com/album/456"))).toEqual({
      requests: 1,
      problem: "a redirect away from the album (302)",
    });
    expect(await tidal.album(linkOf("https://tidal.com/album/789"))).toMatchObject({
      problem: "a redirect away from the album (301)",
    });
    expect(asked).toHaveLength(4);
  });

  test("reports a missing page or one without the facts", async () => {
    const { tidal } = store({ "/album/2": { status: 200, body: "<html></html>" } });
    expect(await tidal.album(linkOf("https://tidal.com/album/1"))).toEqual({
      requests: 1,
      problem: "the page answered 404",
    });
    expect(await tidal.album(linkOf("https://tidal.com/album/2"))).toEqual({
      requests: 1,
      problem: "no title, artist and date on the page",
    });
  });

  test("checks robots.txt for album pages", async () => {
    const allowed = "User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n";
    expect(
      await store({ "/robots.txt": { status: 200, body: allowed } }).tidal.albumPagesAllowed(),
    ).toBe(true);
    const closed = "User-agent: *\nDisallow: /album/\n";
    expect(
      await store({ "/robots.txt": { status: 200, body: closed } }).tidal.albumPagesAllowed(),
    ).toBe(false);
  });
});
