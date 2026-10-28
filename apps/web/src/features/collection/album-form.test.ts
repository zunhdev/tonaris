// The manual entry form's rules (DS-47, FR-02.4, FR-02.6, AC-08).

import { describe, expect, test } from "bun:test";

import { uuidv7 } from "@tonaris/domain";

import {
  albumOfForm,
  emptyForm,
  formOf,
  formProblems,
  isFormDirty,
  linksOfForm,
  type AlbumForm,
} from "./album-form";

const form = (values: Partial<AlbumForm> = {}): AlbumForm => ({
  ...emptyForm(null),
  title: "Nightfall",
  artistCredit: "Candlemass",
  originalYear: "1987",
  ...values,
});

describe("required information (FR-02.6)", () => {
  test("a title alone reports the artist and the year missing, and makes no album", () => {
    const titleOnly = { ...emptyForm(null), title: "Nightfall" };
    expect(formProblems(titleOnly)).toEqual({
      artistCredit: "Give the album an artist.",
      originalYear: "Give the album its original release year.",
    });
    expect(albumOfForm(titleOnly)).toBeUndefined();
  });

  test("a live album needs its recording year or its release year, not both", () => {
    expect(formProblems(form({ isLive: true, originalYear: "" }))).toEqual({
      originalYear: "Give the album its recording year or its release year.",
    });
    expect(formProblems(form({ isLive: true, originalYear: "", recording: "1978–1982" }))).toEqual(
      {},
    );
    expect(formProblems(form({ isLive: true }))).toEqual({});
  });

  test("years are digits, a range runs forwards, and a range is for recordings only", () => {
    expect(formProblems(form({ originalYear: "nineteen" }))).toEqual({
      originalYear: "Enter the year as four digits, such as 1986.",
    });
    expect(formProblems(form({ originalYear: "1978–1982" })).originalYear).toBeDefined();
    expect(formProblems(form({ isLive: true, recording: "1982–1978" }))).toEqual({
      recording: "The recording period ends before it starts.",
    });
  });
});

describe("the album it makes", () => {
  test("is trimmed, keeps what was left empty empty, and ignores recording years unless live", () => {
    const made = albumOfForm(form({ title: "  Nightfall ", recording: "1980" }));
    expect(made).toMatchObject({
      title: "Nightfall",
      artistCredit: "Candlemass",
      releaseType: null,
      isLive: false,
      originalYear: 1987,
      recordingYearStart: null,
      recordingYearEnd: null,
      artworkUrl: null,
    });
    expect(
      albumOfForm(
        form({ isLive: true, originalYear: "", recording: "1978–1982", releaseType: "album" }),
      ),
    ).toMatchObject({
      isLive: true,
      originalYear: null,
      recordingYearStart: 1978,
      recordingYearEnd: 1982,
      artworkUrl: null,
    });
  });

  test("a failed album opens again as it was entered, and a touched form is dirty", () => {
    const album = {
      id: uuidv7(),
      title: "Live Evil",
      artistCredit: "Black Sabbath",
      releaseType: null,
      isLive: true,
      originalYear: 1982,
      recordingYearStart: 1982,
      recordingYearEnd: 1982,
      artworkUrl: null,
    };
    expect(formOf(album, "list")).toEqual({
      title: "Live Evil",
      artistCredit: "Black Sabbath",
      releaseType: null,
      isLive: true,
      originalYear: "1982",
      recording: "1982",
      artworkUrl: "",
      links: { spotify: "", "apple-music": "", qobuz: "", tidal: "" },
      fieldValues: [],
      listId: "list",
    });
    expect(isFormDirty(emptyForm("list"))).toBe(false);
    expect(isFormDirty({ ...emptyForm("list"), title: "N" })).toBe(true);
    const linked = emptyForm(null);
    expect(
      isFormDirty({ ...linked, links: { ...linked.links, tidal: "https://tidal.com/album/1" } }),
    ).toBe(true);
  });
});

describe("links (FR-06.3, TS-40)", () => {
  const valid = {
    ...emptyForm(null),
    title: "Bleach",
    artistCredit: "Nirvana",
    originalYear: "1989",
  };

  test("each service's link is optional, checked as the server reads it, and saved as typed", () => {
    expect(formProblems(valid)).toEqual({});
    const typed = {
      ...valid,
      links: {
        ...valid.links,
        spotify: " https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=x ",
        tidal: "https://tidal.com/album/77654321",
      },
    };
    expect(formProblems(typed)).toEqual({});
    const albumId = uuidv7();
    expect(linksOfForm(typed, albumId)).toEqual([
      {
        albumId,
        service: "spotify",
        url: "https://open.spotify.com/album/1KQ1Pf4ikoK1jBbOtOHvOv?si=x",
      },
      { albumId, service: "tidal", url: "https://tidal.com/album/77654321" },
    ]);
  });

  test("another service's link, or unsupported input, is a problem at its field", () => {
    const typed = {
      ...valid,
      links: {
        ...valid.links,
        spotify: "https://music.apple.com/us/album/1440828018",
        qobuz: "not a link",
      },
    };
    expect(formProblems(typed)).toEqual({
      spotify: "This is an Apple Music link. Paste a Spotify link here.",
      qobuz: "This doesn't look like a Spotify, Apple Music, Qobuz or Tidal album or track link.",
    });
    expect(albumOfForm(typed)).toBeUndefined();
  });
});

describe("artwork (FR-03.4)", () => {
  const valid = {
    ...emptyForm(null),
    title: "Bleach",
    artistCredit: "Nirvana",
    originalYear: "1989",
  };

  test("an https link is the album's artwork; empty is none", () => {
    expect(
      albumOfForm({ ...valid, artworkUrl: " https://images.example/bleach.jpg " })?.artworkUrl,
    ).toBe("https://images.example/bleach.jpg");
    expect(albumOfForm(valid)?.artworkUrl).toBeNull();
  });

  test("anything else is a problem at its field", () => {
    expect(formProblems({ ...valid, artworkUrl: "http://images.example/bleach.jpg" })).toEqual({
      artworkUrl: "Give the artwork as an https link, such as https://example.com/cover.jpg.",
    });
  });
});
