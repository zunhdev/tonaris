// "Add a favorite"'s choices (DS-93, TON-297): favorites already left out, matches by title or artist in any spelling,
// whole titles first, and moving one up or down.

import { describe, expect, test } from "bun:test";

import { uuidv7, type Album } from "@tonaris/domain";

import { albumChoices, findAlbums, moved } from "./favorite-picker";

const album = (title: string, artistCredit: string): Album => ({
  id: uuidv7(),
  title,
  artistCredit,
  releaseType: "album",
  isLive: false,
  originalYear: 1990,
  recordingYearStart: null,
  recordingYearEnd: null,
  artworkUrl: null,
});

const titles = (choices: readonly { album: Album }[]) =>
  choices.map((choice) => choice.album.title);

describe("favorite albums to pick (FR-11.16)", () => {
  const nightfall = album("Nightfall", "Candlemass");
  const night = album("Night", "Sleep");
  const homogenic = album("Homogenic", "Björk");
  const choices = albumChoices([nightfall, homogenic, night], [night.id]);

  test("favorites already aren't offered; the rest by title", () => {
    expect(titles(choices)).toEqual(["Homogenic", "Nightfall"]);
  });

  test("each word matches the title or the artist, in any spelling", () => {
    expect(titles(findAlbums(choices, "bjork").shown)).toEqual(["Homogenic"]);
    expect(titles(findAlbums(choices, "night candle").shown)).toEqual(["Nightfall"]);
    expect(findAlbums(choices, "  ")).toEqual({ shown: [], total: 0 });
  });

  test("whole titles first", () => {
    const all = albumChoices([nightfall, night, album("Days", "Night Ranger")], []);
    expect(titles(findAlbums(all, "night").shown)).toEqual(["Night", "Nightfall", "Days"]);
  });

  test("moving up or down, never past either end", () => {
    expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moved(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moved(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});
