import { describe, expect, test } from "bun:test";

import type { ServiceLink } from "@tonaris/domain";

import { pastedLinks, savedTitle } from "./pasted-links";

const albumId = "0190a8a0-0000-7000-8000-000000000001";
const spotify: ServiceLink = {
  albumId,
  service: "spotify",
  url: "https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
};
const tidal = "https://tidal.com/browse/album/77654321?u";

describe("pastedLinks (TON-160)", () => {
  test("a link goes to its service's row, as pasted, for the server to make canonical", () => {
    expect(pastedLinks([tidal], [spotify])).toEqual({
      kind: "save",
      links: [{ service: "tidal", url: tidal, replaces: undefined }],
    });
  });

  test("another link for a service the album has replaces it", () => {
    const pasted = "https://open.spotify.com/album/2noRn2Aes5aoNVsU6iWThc";
    expect(pastedLinks([pasted], [spotify])).toEqual({
      kind: "save",
      links: [{ service: "spotify", url: pasted, replaces: spotify }],
    });
  });

  test("a short link names its service, and the server follows it", () => {
    expect(pastedLinks(["https://spotify.link/AbCdEf"], [])).toEqual({
      kind: "save",
      links: [{ service: "spotify", url: "https://spotify.link/AbCdEf", replaces: undefined }],
    });
  });

  test("several services' links go to their rows; the album's own link again changes nothing", () => {
    const qobuz = "https://www.qobuz.com/us-en/album/weezer-teal-album-weezer/mco0vy9isdq4a";
    const plan = pastedLinks(
      [tidal, "https://open.spotify.com/intl-de/album/1KVGLuPtrMrLlyy4Je6df7?si=x", qobuz],
      [spotify],
    );
    expect(plan).toEqual({
      kind: "save",
      links: [
        { service: "tidal", url: tidal, replaces: undefined },
        { service: "qobuz", url: qobuz, replaces: undefined },
      ],
    });
  });

  test("the album's own links pasted again change nothing, and say so", () => {
    expect(pastedLinks([`${spotify.url}?si=abc`], [spotify])).toEqual({
      kind: "unchanged",
      reason: "The album already has this Spotify link.",
    });
    const tidalLink: ServiceLink = {
      albumId,
      service: "tidal",
      url: "https://tidal.com/album/77654321",
    };
    expect(pastedLinks([spotify.url, tidal], [spotify, tidalLink])).toEqual({
      kind: "unchanged",
      reason: "The album already has these links.",
    });
  });

  test("a link that can't be one sends nothing, with capture's reason", () => {
    expect(
      pastedLinks([tidal, "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"], []),
    ).toEqual({
      kind: "refuse",
      reason: "Only Spotify album and track links can be added.",
    });
  });

  test("two links for one service send nothing", () => {
    expect(pastedLinks([tidal, "https://tidal.com/album/1234567"], [])).toEqual({
      kind: "refuse",
      reason: "Paste one Tidal link at a time.",
    });
  });
});

describe("savedTitle", () => {
  test("names what was added or replaced", () => {
    const added = { service: "tidal", url: tidal, replaces: undefined } as const;
    const replaced = { service: "spotify", url: spotify.url, replaces: spotify } as const;
    expect(savedTitle([added])).toBe("Added the Tidal link");
    expect(savedTitle([replaced])).toBe("Replaced the Spotify link");
    expect(savedTitle([added, { ...added, service: "qobuz" }])).toBe(
      "Added the Tidal and Qobuz links",
    );
    expect(savedTitle([replaced, added])).toBe("Saved the Spotify and Tidal links");
  });
});
