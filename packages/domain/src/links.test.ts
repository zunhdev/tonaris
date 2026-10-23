import { describe, expect, test } from "bun:test";

import { sameLink, type LinkRef } from "./links";

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
