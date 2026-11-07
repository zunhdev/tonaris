import { describe, expect, test } from "bun:test";

import { dominantColor, oklch } from "./cover-color";

/** `count` pixels of one color, as RGBA. */
const pixels = (...runs: [number, [number, number, number]][]) =>
  new Uint8ClampedArray(
    runs.flatMap(([count, [r, g, b]]) =>
      Array.from({ length: count }, () => [r, g, b, 255]).flat(),
    ),
  );

describe("cover colors (TON-173)", () => {
  test("sRGB to OKLCH, as CSS Color 4 converts it", () => {
    const red = oklch(255, 0, 0);
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
    expect(oklch(255, 255, 255).c).toBeLessThan(0.001);
  });

  test("a cover's color wins over a larger plain ground", () => {
    // 60% light gray, 40% a saturated blue: the blue is the cover's color.
    const color = dominantColor(pixels([60, [200, 200, 200]], [40, [30, 60, 200]]));
    expect(color?.hue).toBeGreaterThan(250);
    expect(color?.hue).toBeLessThan(275);
    expect(color?.chroma).toBeGreaterThan(0.15);
  });

  test("a black-and-white cover has no chroma, and nearly transparent pixels don't count", () => {
    expect(dominantColor(pixels([50, [0, 0, 0]], [50, [255, 255, 255]]))?.chroma).toBeLessThan(
      0.001,
    );
    const clear = new Uint8ClampedArray([255, 0, 0, 0, 255, 0, 0, 40]);
    expect(dominantColor(clear)).toBeUndefined();
  });
});
