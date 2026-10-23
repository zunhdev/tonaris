import { describe, expect, test } from "bun:test";

import { linkEntityId, sameLink, type LinkRef } from "./links";

const album: LinkRef = { service: "apple-music", kind: "album", id: "268443092" };

describe("sameLink (FR-06.4)", () => {
  test("the same service, kind and id are the same link", () => {
    expect(sameLink(album, { ...album })).toBe(true);
  });

  test("a difference in any of them makes another link", () => {
    expect(sameLink(album, { ...album, service: "tidal" })).toBe(false);
    expect(sameLink(album, { ...album, kind: "track" })).toBe(false);
    expect(sameLink(album, { ...album, id: "268443097" })).toBe(false);
  });
});

describe("linkEntityId (TS-41 step 1)", () => {
  test("the album's id when the link names one, else the track's, marked", () => {
    expect(linkEntityId({ kind: "album", id: "268443092", albumId: "268443092" })).toBe(
      "268443092",
    );
    expect(linkEntityId({ kind: "track", id: "268443097", albumId: "268443092" })).toBe(
      "268443092",
    );
    expect(linkEntityId({ kind: "track", id: "279764934" })).toBe("track:279764934");
  });
});
