// Pull to refresh's arithmetic (TON-139).

import { describe, expect, test } from "bun:test";

import { pullDistance, pullProgress, pullThreshold } from "./pull";

describe("pull to refresh", () => {
  test("the spinner follows half the finger's travel down, up to a limit, and never up", () => {
    expect(pullDistance(-30)).toBe(0);
    expect(pullDistance(40)).toBe(20);
    expect(pullDistance(500)).toBe(120);
  });

  test("letting go reloads once the pull reaches the threshold, a finger's travel of twice that", () => {
    expect(pullDistance(pullThreshold * 2 - 2)).toBeLessThan(pullThreshold);
    expect(pullDistance(pullThreshold * 2)).toBe(pullThreshold);
    expect(pullProgress(pullThreshold / 2)).toBe(0.5);
    expect(pullProgress(pullThreshold * 2)).toBe(1);
  });
});
