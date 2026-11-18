import { describe, expect, test } from "bun:test";

import { avatarOf } from "./avatar";

describe("avatarOf (TON-169)", () => {
  test("the name's first letter, upper-cased, skipping punctuation", () => {
    expect(avatarOf("zunh").letter).toBe("Z");
    expect(avatarOf("  ...ada@example.com").letter).toBe("A");
  });

  test("the same name always gets the same color, at the avatar's lightness and chroma", () => {
    expect(avatarOf("Zunh").background).toBe(avatarOf(" Zunh ").background);
    expect(avatarOf("Zunh").background).toMatch(/^oklch\(0\.52 0\.12 \d{1,3}\)$/);
    expect(avatarOf("Zunh").background).not.toBe(avatarOf("Ada").background);
  });

  test("a chosen hue wins over the name's (TON-296)", () => {
    expect(avatarOf("Zunh", 240).background).toBe("oklch(0.52 0.12 240)");
    expect(avatarOf("Ada", 240).background).toBe(avatarOf("Zunh", 240).background);
    expect(avatarOf("Zunh", null).background).toBe(avatarOf("Zunh").background);
  });
});
