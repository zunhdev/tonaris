// The manual entry form's rules (DS-47, FR-02.4, FR-02.6, AC-08).

import { describe, expect, test } from "bun:test";

import { uuidv7 } from "@tonaris/domain";

import {
  albumOfForm,
  emptyForm,
  formOf,
  formProblems,
  isFormDirty,
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
    };
    expect(formOf(album, "list")).toEqual({
      title: "Live Evil",
      artistCredit: "Black Sabbath",
      releaseType: null,
      isLive: true,
      originalYear: "1982",
      recording: "1982",
      listId: "list",
    });
    expect(isFormDirty(emptyForm("list"))).toBe(false);
    expect(isFormDirty({ ...emptyForm("list"), title: "N" })).toBe(true);
  });
});
