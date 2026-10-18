import { describe, expect, test } from "bun:test";

import { contrastRatio, parseOklch, relativeLuminance } from "./color";

const white = parseOklch("oklch(1 0 0)");
const black = parseOklch("oklch(0 0 0)");
// sRGB red (#ff0000) in OKLCH, as CSS Color 4 converts it.
const red = parseOklch("oklch(0.627955 0.257683 29.2339)");

describe("parseOklch", () => {
  test("reads lightness, chroma, hue and an optional alpha", () => {
    expect(parseOklch("oklch(0.66 0.17 275)")).toEqual({ l: 0.66, c: 0.17, h: 275, alpha: 1 });
    expect(parseOklch("oklch(0.66 0.17 275 / 12%)").alpha).toBeCloseTo(0.12);
    expect(parseOklch("oklch(0 0 0 / 0.4)").alpha).toBeCloseTo(0.4);
  });

  test("rejects anything else", () => {
    expect(() => parseOklch("#ffffff")).toThrow("Not an oklch() color");
  });
});

describe("relativeLuminance", () => {
  test("matches WCAG for white, black and sRGB red", () => {
    expect(relativeLuminance(white)).toBeCloseTo(1, 4);
    expect(relativeLuminance(black)).toBeCloseTo(0, 6);
    expect(relativeLuminance(red)).toBeCloseTo(0.2126, 3);
  });
});

describe("contrastRatio", () => {
  test("spans 1 to 21 and is symmetric", () => {
    expect(contrastRatio(white, black)).toBeCloseTo(21, 2);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 2);
    expect(contrastRatio(red, red)).toBeCloseTo(1, 6);
    // WCAG's own example: red on white is 4.0:1.
    expect(contrastRatio(red, white)).toBeCloseTo(4, 1);
  });

  test("blends a translucent color over its background first", () => {
    const halfWhite = parseOklch("oklch(1 0 0 / 50%)");
    const ratio = contrastRatio(halfWhite, black);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(21);
    expect(contrastRatio(parseOklch("oklch(1 0 0 / 0%)"), black)).toBeCloseTo(1, 6);
  });
});
