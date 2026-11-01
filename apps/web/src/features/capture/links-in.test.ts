import { describe, expect, test } from "bun:test";

import { isLinkLike, linesIn, linksIn } from "./links-in";

describe("linksIn (DS-48)", () => {
  test("keeps the lines that look like links, trimmed, in order", () => {
    const pasted = [
      "  https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=x ",
      "Check these out:",
      "spotify:album:1KQ1Pf4ikoK1jBbOtOHvOv",
      "",
      "music.apple.com/us/album/nevermind/1440783617",
      "tidal.com/browse/album/77654321",
      "music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      "http://example.com/not-a-service",
    ].join("\r\n");
    expect(linksIn(pasted)).toEqual([
      "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=x",
      "spotify:album:1KQ1Pf4ikoK1jBbOtOHvOv",
      "music.apple.com/us/album/nevermind/1440783617",
      "tidal.com/browse/album/77654321",
      "music.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      // Capture explains it: it is a link, of no service.
      "http://example.com/not-a-service",
    ]);
  });

  test("ordinary text has no links", () => {
    expect(linksIn("Remember to buy milk\nand eggs")).toEqual([]);
    expect(isLinkLike("open.spotify.com")).toBe(false);
    expect(isLinkLike("https://open.spotify.com/album/x y")).toBe(false);
    expect(isLinkLike("spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv")).toBe(false);
    expect(isLinkLike("see open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv")).toBe(false);
  });

  test("a line without its scheme counts on any service's host, short links' too, in any case", () => {
    for (const line of [
      "spotify.link/abc",
      "Play.Qobuz.com/album/0886443927087",
      "www.tidal.com/album/77654321",
      "m.youtube.com/playlist?list=OLAK5uy_nWC5iqagpZUFETQCWd8k-Fi_Ec3cWwClM",
      "geo.music.apple.com/album/1440783617",
    ]) {
      expect(isLinkLike(line)).toBe(true);
    }
  });

  test("the dialog sends every non-empty line", () => {
    expect(linesIn(" a \n\n b\r\n")).toEqual(["a", "b"]);
  });
});
