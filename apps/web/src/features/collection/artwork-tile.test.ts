// The artwork fallback tile (DS-23).

import { describe, expect, test } from "bun:test";

import { artworkTile } from "./artwork-tile";

describe("artwork fallback tile (DS-23)", () => {
  test("the same title gets the same tile; another title most likely another hue", () => {
    expect(artworkTile("Nightfall")).toEqual(artworkTile("Nightfall"));
    expect(artworkTile("Nightfall").background).not.toBe(artworkTile("Epicus").background);
    expect(artworkTile("Nightfall").background).toMatch(/^oklch\(0\.33 0\.04 \d+\)$/);
  });

  test("the letter is the first grapheme, upper-cased", () => {
    expect(artworkTile("  nightfall").letter).toBe("N");
    expect(artworkTile("élan").letter).toBe("É");
    expect(artworkTile("👩‍🎤 Live").letter).toBe("👩‍🎤");
  });

  test("leading punctuation is skipped; symbols are kept (TON-110)", () => {
    expect(artworkTile("...And Justice for All").letter).toBe("A");
    expect(artworkTile("…And Justice for All").letter).toBe("A");
    expect(artworkTile("(What's the Story) Morning Glory?").letter).toBe("W");
    expect(artworkTile('"Heroes"').letter).toBe("H");
    expect(artworkTile("÷").letter).toBe("÷");
    expect(artworkTile("...").letter).toBe(".");
  });

  test("a blank title gets a neutral tile without a letter", () => {
    expect(artworkTile(" ")).toEqual({
      letter: "",
      background: "oklch(0.3 0 0)",
      foreground: "oklch(0.86 0 0)",
    });
  });
});
