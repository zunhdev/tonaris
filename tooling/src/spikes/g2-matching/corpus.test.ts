// The TON-18 corpus logic and scoring: edition kinds, streaming links, same-title groups and their judgement,
// link selection, and how outcomes and pairs are scored.

import { describe, expect, test } from "bun:test";

import {
  compareTracks,
  type EditionKind,
  editionKinds,
  judgePair,
  pairKey,
  type ReleaseGroup,
  sameTitleGroups,
  streamingLink,
} from "./corpus";
import { classify, scorePairs, selectLinks, truthOf } from "./evaluate";

const group = (id: string, title: string, date: string, extra: Partial<ReleaseGroup> = {}) => ({
  id,
  title,
  firstReleaseDate: date,
  primaryType: "Album",
  secondaryTypes: [],
  disambiguation: "",
  ...extra,
});

describe("editionKinds", () => {
  const first = { date: "1989-06-15", country: "US" };
  test("the first release is the original", () => {
    expect(editionKinds({ title: "Bleach", disambiguation: "", ...first }, first)).toEqual([
      "original",
    ]);
  });
  test("titles and disambiguations name deluxe, remastered and anniversary editions", () => {
    expect(
      editionKinds(
        { title: "Bleach", disambiguation: "2009 re-mastered version", date: "2016" },
        first,
      ),
    ).toEqual(["remaster", "reissue"]);
    expect(
      editionKinds(
        { title: "Bleach: Deluxe Edition", disambiguation: "", date: "1989-06-15" },
        first,
      ),
    ).toEqual(["deluxe"]);
  });
  test("another country is regional, but a worldwide digital release isn't", () => {
    expect(
      editionKinds({ title: "Bleach", disambiguation: "", date: "1989", country: "GB" }, first),
    ).toEqual(["regional"]);
    expect(
      editionKinds({ title: "Bleach", disambiguation: "", date: "1989", country: "XW" }, first),
    ).toEqual(["original"]);
  });
});

describe("streamingLink", () => {
  test("keeps Spotify, Apple Music and Qobuz album links", () => {
    expect(streamingLink("https://open.spotify.com/album/4vEqluvGq8AC9Xx2Fx4cZ3")).toEqual({
      link: "https://open.spotify.com/album/4vEqluvGq8AC9Xx2Fx4cZ3",
      service: "spotify",
    });
    expect(streamingLink("https://www.qobuz.com/album/bleach-nirvana/tietg8e0jjdh8")?.service).toBe(
      "qobuz",
    );
  });
  test("turns MusicBrainz's old itunes.apple.com links into Apple Music links", () => {
    expect(streamingLink("https://itunes.apple.com/gb/album/bleach/id669728060")).toEqual({
      link: "https://music.apple.com/gb/album/669728060",
      service: "apple-music",
    });
  });
  test("drops other sites and track links", () => {
    expect(streamingLink("https://www.deezer.com/album/1")).toBeUndefined();
    expect(streamingLink("https://open.spotify.com/track/4vEqluvGq8AC9Xx2Fx4cZ3")).toBeUndefined();
  });
});

describe("same-title pairs", () => {
  const nevermind = group("nm", "Nevermind", "1991-09-24");
  const superDeluxe = group("nm30", "Nevermind (30th Anniversary Super Deluxe)", "1991-09-24", {
    secondaryTypes: ["Compilation"],
  });
  const fearless = group("f", "Fearless", "2008-11-11");
  const taylorsVersion = group("ftv", "Fearless (Taylor's Version)", "2021-04-09");
  const blue = group("w1", "Weezer", "1994-05-10");
  const green = group("w2", "Weezer", "2001-05-15");
  const live = group("w3", "Weezer", "1994-05-10", { secondaryTypes: ["Live"] });

  test("groups an artist's albums by their title without edition notes", () => {
    const groups = sameTitleGroups([nevermind, superDeluxe, fearless, blue, green]);
    expect(groups.map((members) => members.map((m) => m.id))).toEqual([
      ["nm", "nm30"],
      ["w1", "w2"],
    ]);
  });
  test("without track lists, an edition note in the same year is a split-off edition, to review", () => {
    expect(judgePair(nevermind, superDeluxe)).toMatchObject({ same: true, review: true });
    expect(judgePair(fearless, taylorsVersion)).toMatchObject({ same: false, review: true });
    expect(judgePair(blue, green)).toMatchObject({ same: false, review: false });
  });
  test("a live album is always a different album", () => {
    expect(judgePair(blue, live, { a: 10, b: 10, shared: 10 })).toMatchObject({ same: false });
  });
  test("the same track list is one album, whatever the year", () => {
    const reissue = group("w1r", "Weezer", "2004-05-10");
    expect(judgePair(blue, reissue, { a: 10, b: 10, shared: 9 })).toMatchObject({
      same: true,
      reason: "the same track list",
    });
  });
  test("an EP of the album's songs is a different release", () => {
    const ep = group("ep", "Weezer", "1994-08-01", { primaryType: "EP" });
    expect(judgePair(blue, ep, { a: 10, b: 4, shared: 4 })).toMatchObject({ same: false });
  });
  test("a later release holding the whole album is its edition, to review", () => {
    expect(judgePair(nevermind, superDeluxe, { a: 12, b: 75, shared: 12 })).toMatchObject({
      same: true,
      reason: "an edition holding the whole album",
      review: true,
    });
  });
  test("a best-of inside a bigger best-of is a different album", () => {
    const hits = group("h1", "Greatest Hits", "1972", { secondaryTypes: ["Compilation"] });
    const box = group("h2", "Greatest Hits", "2009", { secondaryTypes: ["Compilation"] });
    expect(judgePair(hits, box, { a: 11, b: 33, shared: 11 })).toMatchObject({ same: false });
  });
  test("other tracks are a different album", () => {
    expect(judgePair(blue, green, { a: 10, b: 10, shared: 0 })).toMatchObject({ same: false });
  });
  test("track lists compare on their titles", () => {
    expect(compareTracks(new Set(["a", "b"]), new Set(["a", "b", "c"]))).toEqual({
      a: 2,
      b: 3,
      shared: 2,
    });
    expect(compareTracks(new Set(), new Set(["a"]))).toBeUndefined();
  });
  test("a reviewed verdict overrides the heuristic", () => {
    const pair = { a: "f", b: "ftv", ...judgePair(fearless, taylorsVersion) };
    expect(truthOf(pair, {}).reviewed).toBe(false);
    expect(truthOf(pair, { [pairKey("ftv", "f")]: { same: false, note: "re-recording" } })).toEqual(
      {
        a: "f",
        b: "ftv",
        same: false,
        reviewed: true,
        note: "re-recording",
      },
    );
  });
  test("the release-group rule splits same albums; similarity merges different ones", () => {
    const truths = [
      { a: "nm", b: "nm30", same: true, reviewed: true, note: "" },
      { a: "w1", b: "w2", same: false, reviewed: false, note: "" },
      { a: "f", b: "ftv", same: false, reviewed: true, note: "" },
    ];
    expect(scorePairs(truths)).toEqual({
      pairs: 3,
      releaseGroup: { right: 2, splits: 1 },
      similarity: { right: 1, wrongMerges: 2 },
    });
  });
});

const edition = (releaseGroupId: string, kinds: EditionKind[], links: string[], date = "2000") => ({
  releaseGroupId,
  releaseId: `${releaseGroupId}-${date}`,
  title: "",
  disambiguation: "",
  date,
  kinds,
  links,
});
const serviceOf = (link: string) =>
  link.startsWith("s")
    ? ("spotify" as const)
    : link.startsWith("a")
      ? ("apple-music" as const)
      : undefined;
const sameAlbum = (a: string, b: string) => pairKey(a, b) === pairKey("nm", "nm30");

describe("selectLinks", () => {
  test("prefers the editions furthest from the original, one link per service", () => {
    const picked = selectLinks(
      [
        edition("rg", ["original"], ["s-orig", "a-orig"], "1989"),
        edition("rg", ["deluxe", "reissue"], ["s-deluxe"], "2009"),
      ],
      serviceOf,
      2,
      { spotify: 10, "apple-music": 10, qobuz: 10, tidal: 10, "youtube-music": 10 },
    );
    expect(picked.map((p) => p.link)).toEqual(["s-deluxe", "a-orig"]);
  });
  test("caps links per album and per service", () => {
    const editions = ["x", "y", "z"].map((id) => edition(id, ["original"], [`s-${id}`, `a-${id}`]));
    const caps = { spotify: 2, "apple-music": 10, qobuz: 10, tidal: 10, "youtube-music": 10 };
    expect(selectLinks(editions, serviceOf, 1, caps).map((p) => p.link)).toEqual(["s-x", "s-y"]);
  });
});

describe("classify", () => {
  test("right, split, wrong, several and none", () => {
    expect(classify("nm", ["nm", "nm"], sameAlbum)).toBe("right");
    expect(classify("nm", ["nm30"], sameAlbum)).toBe("split");
    expect(classify("nm", ["in-utero"], sameAlbum)).toBe("wrong");
    expect(classify("nm", ["nm", "nm30"], sameAlbum)).toBe("several");
    expect(classify("nm", [], sameAlbum)).toBe("none");
  });
});
