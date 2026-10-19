// The TON-15 bridge against fake Spotify and MusicBrainz services: barcode forms, album-level decisions, the
// client's token reuse and 429 handling, and that no Spotify value leaves memory.

import { describe, expect, test } from "bun:test";

import { MusicBrainz } from "../g1-musicbrainz/musicbrainz";
import { barcodeForms, bridgeLink, decide } from "./bridge";
import { Spotify } from "./spotify";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const upc = "0602547288042";
const albumId = "4aawyAB9vmqN3uQ7FjRGTy";
const trackId = "1rqqCSm0Qe4I9rUvWncaom";
const group = (id: string, title = "An Album") => ({
  id,
  title,
  "primary-type": "Album",
  "secondary-types": [],
});

/** Spotify with one album and one track on it; the first album request is throttled when `throttle` is set. */
function fakeSpotify(options: { throttle?: boolean; noUpc?: boolean } = {}) {
  let tokens = 0;
  let throttled = false;
  const fetcher = async (href: string) => {
    const url = new URL(href);
    if (url.hostname === "accounts.spotify.com") {
      tokens++;
      return json({ access_token: `t${tokens}`, token_type: "Bearer", expires_in: 3600 });
    }
    if (options.throttle && !throttled) {
      throttled = true;
      return json(
        { error: { status: 429, message: "Too many requests", reason: "QUOTA_EXCEEDED" } },
        429,
        { "retry-after": "0" },
      );
    }
    if (url.pathname === `/v1/albums/${albumId}`) {
      return json({ id: albumId, external_ids: options.noUpc ? {} : { upc } });
    }
    if (url.pathname === `/v1/tracks/${trackId}`)
      return json({ id: trackId, album: { id: albumId } });
    return json({ error: { status: 404, message: "Resource not found" } }, 404);
  };
  return { fetcher, tokens: () => tokens };
}

/** MusicBrainz that links the album URL when `linked`, and has releases of `groups` with the UPC's 12-digit form. */
function fakeMusicBrainz(options: { linked?: string; groups?: string[] } = {}) {
  return async (href: string) => {
    const url = new URL(href);
    const query = url.searchParams.get("query") ?? "";
    if (url.pathname.endsWith("/url")) {
      if (!options.linked) return json({ error: "Not Found" }, 404);
      return json({
        resource: `https://open.spotify.com/album/${albumId}`,
        relations: [{ "target-type": "release", release: { id: "r-linked" } }],
      });
    }
    if (query.startsWith("reid:")) {
      return json({ releases: [{ id: "r-linked", "release-group": group(options.linked ?? "") }] });
    }
    if (query.startsWith("barcode:")) {
      return json({
        releases: (options.groups ?? []).map((id, i) => ({
          id: `r${i}`,
          barcode: upc.slice(1),
          "release-group": group(id),
        })),
      });
    }
    if (url.searchParams.has("release-group")) {
      return json({ releases: [{ barcode: null, media: [{ format: "CD" }] }] });
    }
    throw new Error(`unexpected ${href}`);
  };
}

const clients = (spotify = fakeSpotify(), mb = fakeMusicBrainz()) => ({
  spotify: new Spotify({
    clientId: "id",
    clientSecret: "secret",
    fetch: spotify.fetcher,
    minIntervalMs: 0,
    sleep: async () => {},
  }),
  mb: new MusicBrainz({ fetch: mb, minIntervalMs: 0, sleep: async () => {} }),
});

describe("barcodeForms", () => {
  const forms = ["602547288042", upc, `0${upc}`];
  test("a UPC-A, its EAN-13 and its GTIN-14 find each other", () => {
    expect(barcodeForms(upc)).toEqual(forms);
    expect(barcodeForms("602547288042")).toEqual(forms);
    expect(barcodeForms(`0${upc}`)).toEqual(forms);
  });
  test("an EAN-13 without a leading zero has no UPC-A form", () => {
    expect(barcodeForms("5099902987620")).toEqual(["5099902987620", "05099902987620"]);
  });
  test("anything else isn't a barcode", () => expect(barcodeForms("B000002UAL")).toEqual([]));
});

describe("decide", () => {
  test("several releases of one album are one album", () => {
    expect(decide(["rg", "rg"], 2)).toEqual({
      outcome: "confident",
      releaseGroupIds: ["rg"],
      releases: 2,
    });
  });
  test("two albums need the person", () =>
    expect(decide(["a", "b"], 2).outcome).toBe("needs_input"));
  test("nothing passes to the next step", () => expect(decide([], 0).outcome).toBe("none"));
});

describe("Spotify", () => {
  test("reuses its token and waits out a 429, telling a quota from a rate limit", async () => {
    const fake = fakeSpotify({ throttle: true });
    const { spotify } = clients(fake);
    expect(await spotify.album(albumId)).toEqual({ upc });
    expect(await spotify.parentAlbum(trackId)).toBe(albumId);
    expect(fake.tokens()).toBe(1);
    expect(spotify.requests.map((r) => [r.call, r.status, r.retries])).toEqual([
      ["token", 200, 0],
      ["album", 200, 1],
      ["track", 200, 0],
    ]);
    expect(spotify.requests[1]?.throttled).toEqual([{ retryAfter: 0, quota: true }]);
  });
  test("an unknown album or track is undefined", async () => {
    const { spotify } = clients();
    expect(await spotify.album("0000000000000000000000")).toBeUndefined();
    expect(await spotify.parentAlbum("0000000000000000000000")).toBeUndefined();
  });
});

describe("bridgeLink", () => {
  const link = `https://open.spotify.com/album/${albumId}?si=abc`;
  const labels = { [link]: { releaseGroupIds: ["rg-1"], source: "test" } };

  test("the bridge finds an album the URL lookup misses", async () => {
    const { spotify, mb } = clients(fakeSpotify(), fakeMusicBrainz({ groups: ["rg-1", "rg-1"] }));
    const r = await bridgeLink(0, link, labels, mb, spotify);
    expect(r.step2?.outcome).toBe("none");
    expect(r).toMatchObject({ upc: "present", upcDigits: 13, step3Correct: true });
    expect(r.chain).toEqual({
      outcome: "confident",
      step: 3,
      releaseGroupId: "rg-1",
      correct: true,
    });
    expect(r.spotify.calls).toBe(2);
    expect(JSON.stringify(r)).not.toContain(upc.slice(1));
  });

  test("a miss records what the right album's releases lack", async () => {
    const { spotify, mb } = clients(fakeSpotify(), fakeMusicBrainz());
    const r = await bridgeLink(0, link, labels, mb, spotify);
    expect(r.chain?.outcome).toBe("none");
    expect(r.miss).toEqual({ releases: 1, withBarcode: 0, digital: 0, barcodeFormsMissed: false });
  });

  test("an album without a UPC stops at step 3", async () => {
    const { spotify, mb } = clients(fakeSpotify({ noUpc: true }));
    const r = await bridgeLink(0, link, labels, mb, spotify);
    expect(r).toMatchObject({ upc: "missing", chain: { outcome: "none" } });
    expect(r.step3).toBeUndefined();
  });

  test("a track link goes through its parent album, which isn't kept", async () => {
    const { spotify, mb } = clients(
      fakeSpotify(),
      fakeMusicBrainz({ linked: "rg-1", groups: ["rg-1"] }),
    );
    const r = await bridgeLink(0, `https://open.spotify.com/track/${trackId}`, {}, mb, spotify);
    expect(r).toMatchObject({ kind: "track", parentFound: true, agrees: true, step3Correct: true });
    expect(r.truth?.source).toBe("MusicBrainz URL relationship");
    expect(r.chain).toMatchObject({ step: 2, releaseGroupId: "rg-1" });
    expect(r.spotify.calls).toBe(3);
    expect(JSON.stringify(r)).not.toContain(albumId);
  });

  test("an error keeps the UPC out of its message", async () => {
    const { spotify } = clients();
    const mb = new MusicBrainz({
      fetch: async (href) => (href.includes("barcode") ? json({}, 500) : fakeMusicBrainz()(href)),
      minIntervalMs: 0,
      sleep: async () => {},
    });
    const r = await bridgeLink(0, link, labels, mb, spotify);
    expect(r.error).toBe("MusicBrainz answered 500 for https://musicbrainz.org/ws/2/release?…");
    expect(JSON.stringify(r)).not.toContain(upc.slice(1));
  });

  test("two albums under one barcode go to the person", async () => {
    const { spotify, mb } = clients(fakeSpotify(), fakeMusicBrainz({ groups: ["rg-1", "rg-2"] }));
    const r = await bridgeLink(0, link, labels, mb, spotify);
    expect(r.chain).toEqual({ outcome: "needs_input", step: 3 });
  });
});
