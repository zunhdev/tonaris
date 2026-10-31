// The YouTube Music hints' reading of a distributor's description (TON-128).

import { describe, expect, test } from "bun:test";

import { albumTitle, descriptionFacts } from "./youtube";

describe("descriptionFacts", () => {
  test("reads the credited artists and the release date", () => {
    const description = [
      "Provided to YouTube by Universal Music Group",
      "",
      "Un jour, un enfant · Frida Boccara",
      "",
      "Un jour un enfant",
      "",
      "℗ 1969 Frida Boccara",
      "",
      "Released on: 1988-01-01",
    ].join("\n");
    expect(descriptionFacts(description)).toEqual({
      artists: ["Frida Boccara"],
      date: "1988-01-01",
    });
  });

  test("falls back to the ℗ year, and keeps every credited artist", () => {
    const description = "Provided to YouTube by X\n\nSong · A · B\n\nAlbum\n\n℗ 2001 Label";
    expect(descriptionFacts(description)).toEqual({ artists: ["A", "B"], date: "2001-01-01" });
  });

  test("an upload that isn't a distributor's says nothing", () => {
    expect(descriptionFacts("Stromae - Invaincu (Official Audio)\nOrder my album")).toEqual({});
  });
});

test("the album's title drops the playlist's \"Album - \"", () => {
  expect(albumTitle("Album - Golden Hour")).toBe("Golden Hour");
  expect(albumTitle("EP - Lost & Found")).toBe("Lost & Found");
  expect(albumTitle("Natural")).toBe("Natural");
  expect(albumTitle("Best Of - Live")).toBe("Best Of - Live");
});
