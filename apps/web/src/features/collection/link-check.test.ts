import { describe, expect, test } from "bun:test";

import { checkLink } from "./link-check";

describe("checkLink (TS-40)", () => {
  test("a service's album and track links, and Spotify's short links, pass", () => {
    expect(checkLink("spotify", "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=x")).toBe(
      undefined,
    );
    expect(checkLink("tidal", "https://tidal.com/browse/track/77654321")).toBe(undefined);
    expect(checkLink("spotify", "https://spotify.link/AbCdEf")).toBe(undefined);
    expect(checkLink("qobuz", "  ")).toBe(undefined);
  });

  test("another service's link names both services", () => {
    expect(checkLink("spotify", "https://music.apple.com/us/album/1440828018")).toBe(
      "This is an Apple Music link. Paste a Spotify link here.",
    );
    expect(checkLink("tidal", "https://spotify.link/AbCdEf")).toBe(
      "This is a Spotify link. Paste a Tidal link here.",
    );
  });

  test("unsupported input gets capture's reason", () => {
    expect(checkLink("qobuz", "not a link")).toBe(
      "This doesn't look like a Spotify, Apple Music, Qobuz, Tidal or YouTube Music album or track link.",
    );
    expect(checkLink("spotify", "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "Only Spotify album and track links can be added.",
    );
  });
});
