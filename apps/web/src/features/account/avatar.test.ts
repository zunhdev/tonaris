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
});
