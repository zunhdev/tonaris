// Scrolling a list while a drag nears its edge (DS-49, TON-303).

import { describe, expect, test } from "bun:test";

import { edgeSpeed } from "./edge-scroll";

describe("a drag near a list's edge (TON-303)", () => {
  const list = { top: 100, height: 500 };
  const both = { up: true, down: true };

  test("scrolls up in the top fifth and down in the bottom fifth, fastest at the edge", () => {
    expect(edgeSpeed(list, 100, both)).toBe(-1200);
    expect(edgeSpeed(list, 150, both)).toBe(-600);
    expect(edgeSpeed(list, 200, both)).toBe(0);
    expect(edgeSpeed(list, 350, both)).toBe(0);
    expect(edgeSpeed(list, 550, both)).toBe(600);
    expect(edgeSpeed(list, 600, both)).toBe(1200);
  });

  test("only the way the pointer has moved, and not from outside the list", () => {
    expect(edgeSpeed(list, 120, { up: false, down: true })).toBe(0);
    expect(edgeSpeed(list, 580, { up: true, down: false })).toBe(0);
    expect(edgeSpeed(list, 90, both)).toBe(0);
    expect(edgeSpeed(list, 610, both)).toBe(0);
  });
});
