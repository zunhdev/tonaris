// Step 0 of the G1 spike: the TS-40 link forms, and the ones the spike reports as unsupported.

import { describe, expect, test } from "bun:test";

import { parseLink, resolveShortLink } from "./links";

const parsed = (input: string) => {
  const result = parseLink(input);
  if (!result.ok) throw new Error(`${input} didn't parse: ${result.reason}`);
  return result.link;
};

describe("parseLink (TS-40)", () => {
  test("Spotify album and track links, with or without intl- and query parameters", () => {
    expect(parsed("https://open.spotify.com/album/1weenld61qoidwYuZ1GESA?si=x")).toEqual({
      service: "spotify",
      kind: "album",
      id: "1weenld61qoidwYuZ1GESA",
      albumId: "1weenld61qoidwYuZ1GESA",
      canonical: "https://open.spotify.com/album/1weenld61qoidwYuZ1GESA",
    });
    expect(parsed("https://open.spotify.com/intl-de/track/4vLYewWIvqHfKtJDk8c8tq")).toMatchObject({
      kind: "track",
      id: "4vLYewWIvqHfKtJDk8c8tq",
    });
    expect(parsed("spotify:album:1weenld61qoidwYuZ1GESA").canonical).toBe(
      "https://open.spotify.com/album/1weenld61qoidwYuZ1GESA",
    );
  });

  test("Apple Music links keep the storefront; ?i= is a song on the album in the path", () => {
    expect(parsed("https://music.apple.com/de/album/kind-of-blue/268443092")).toMatchObject({
      service: "apple-music",
      kind: "album",
      albumId: "268443092",
      storefront: "de",
      canonical: "https://music.apple.com/de/album/268443092",
    });
    expect(
      parsed("https://music.apple.com/us/album/kind-of-blue/268443092?i=268443097"),
    ).toMatchObject({
      kind: "track",
      albumId: "268443092",
      trackId: "268443097",
    });
    expect(parsed("https://music.apple.com/album/268443092")).toMatchObject({ storefront: "us" });
  });

  test("Qobuz store, open and play links", () => {
    expect(
      parsed("https://www.qobuz.com/gb-en/album/kind-of-blue-miles-davis/5099749522428"),
    ).toMatchObject({
      service: "qobuz",
      albumId: "5099749522428",
      locale: "gb-en",
      slug: "kind-of-blue-miles-davis",
    });
    expect(
      parsed("https://www.qobuz.com/album/kind-of-blue-miles-davis/5099749522428"),
    ).not.toHaveProperty("locale");
    expect(parsed("https://play.qobuz.com/album/zxbr1mtqo7lha").canonical).toBe(
      "https://open.qobuz.com/album/zxbr1mtqo7lha",
    );
    expect(parsed("https://open.qobuz.com/track/12345678")).not.toHaveProperty("albumId");
  });

  test("Tidal album and track links, with /browse, listen. and a share link's /u", () => {
    expect(parsed("https://tidal.com/browse/album/279764933")).toEqual({
      service: "tidal",
      kind: "album",
      id: "279764933",
      albumId: "279764933",
      canonical: "https://tidal.com/album/279764933",
    });
    expect(parsed("https://listen.tidal.com/album/279764933").canonical).toBe(
      "https://tidal.com/album/279764933",
    );
    expect(parsed("https://tidal.com/album/279764933/u").albumId).toBe("279764933");
    expect(parsed("https://tidal.com/browse/track/279764934?u")).toEqual({
      service: "tidal",
      kind: "track",
      id: "279764934",
      canonical: "https://tidal.com/track/279764934",
    });
    expect(parseLink("https://tidal.com/browse/playlist/abc")).toEqual({
      ok: false,
      reason: "Tidal playlist links aren't supported",
    });
  });

  test("everything else is unsupported, with a reason the report can show", () => {
    expect(parseLink("https://www.youtube.com/watch?v=x")).toEqual({
      ok: false,
      reason: "www.youtube.com isn't a supported service",
    });
    expect(parseLink("https://music.apple.com/us/song/so-what/268443097")).toMatchObject({
      ok: false,
    });
    expect(parseLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toMatchObject({
      ok: false,
    });
    expect(parseLink("Kind of Blue")).toEqual({ ok: false, reason: "not a link" });
    expect(parseLink("https://spotify.link/abc")).toMatchObject({
      ok: false,
      shortLink: "https://spotify.link/abc",
    });
  });
});

const redirect = (location: string) => new Response(null, { status: 307, headers: { location } });

describe("resolveShortLink", () => {
  test("follows allowlisted redirects to the Spotify link", async () => {
    const hops = [
      redirect("https://spotify.app.link/x"),
      redirect("https://open.spotify.com/album/1weenld61qoidwYuZ1GESA"),
    ];
    const fetcher = async () => hops.shift() ?? new Response(null);
    expect(await resolveShortLink("https://spotify.link/abc", fetcher)).toBe(
      "https://open.spotify.com/album/1weenld61qoidwYuZ1GESA",
    );
  });

  test("refuses a redirect off the allowlist", async () => {
    expect(
      resolveShortLink("https://spotify.link/abc", async () => redirect("https://example.com/")),
    ).rejects.toThrow("example.com isn't on the allowlist");
  });
});
