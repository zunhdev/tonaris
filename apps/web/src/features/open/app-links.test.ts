import { describe, expect, test } from "bun:test";

import { appLink } from "./app-links";

describe("appLink (TS-43)", () => {
  test("an album and a track of each service", () => {
    expect(appLink("https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv")).toBe(
      "spotify:album:1KQ1Pf4ikoK1jBbOtOHvOv",
    );
    expect(appLink("https://open.spotify.com/track/3oo3sYwFzKqVvnpQyiAkNx")).toBe(
      "spotify:track:3oo3sYwFzKqVvnpQyiAkNx",
    );
    expect(appLink("https://music.apple.com/fi/album/1440783617")).toBe(
      "music://music.apple.com/fi/album/1440783617",
    );
    expect(appLink("https://music.apple.com/us/album/1440783617?i=1440783622")).toBe(
      "music://music.apple.com/us/album/1440783617?i=1440783622",
    );
    expect(appLink("https://open.qobuz.com/album/0060253780880")).toBe(
      "qobuzapp://album/0060253780880",
    );
    expect(appLink("https://tidal.com/album/77654321")).toBe("tidal://album/77654321");
    expect(appLink("https://tidal.com/track/12345678")).toBe("tidal://track/12345678");
  });

  test("an Apple link without a storefront stays without one", () => {
    expect(appLink("https://music.apple.com/album/1440783617")).toBe(
      "music://music.apple.com/album/1440783617",
    );
  });

  test("anything unreadable has no app link", () => {
    expect(appLink("https://example.com/album/1")).toBeUndefined();
    expect(appLink("https://spotify.link/AbCdEf")).toBeUndefined();
  });
});
