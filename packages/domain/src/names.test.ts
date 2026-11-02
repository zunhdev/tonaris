// Text limits counted in code points (TS-18, TON-151).

import { describe, expect, test } from "bun:test";

import { clipLength, exceedsLength } from "./names";

describe("clipLength", () => {
  test("keeps text within the limit, and cuts longer text at a code point, never inside one", () => {
    expect(clipLength("Kind of Blue", 200)).toBe("Kind of Blue");
    // Each saxophone is one code point and two UTF-16 units.
    expect(clipLength("🎷".repeat(3), 2)).toBe("🎷🎷");
    expect(exceedsLength(clipLength("🎷".repeat(201), 200), 200)).toBe(false);
    expect(clipLength("🎷".repeat(201), 200)).toHaveLength(400);
  });
});
