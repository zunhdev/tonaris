// The workspace's keyboard shortcuts (DS-78).

import { describe, expect, test } from "bun:test";

import { createShortcutMatcher, isTextField, type KeyPress } from "./shortcuts";

const press = (key: string, timeStamp = 0, changes: Partial<KeyPress> = {}): KeyPress => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  target: { tagName: "BODY" },
  timeStamp,
  ...changes,
});

describe("shortcuts (DS-78)", () => {
  test("G then H, U, T or S goes somewhere, within 1.5 s", () => {
    const match = createShortcutMatcher();
    expect(match(press("g", 0))).toBe("pending");
    expect(match(press("u", 400))).toBe("go-unsorted");
    match(press("g", 1_000));
    expect(match(press("H", 1_200))).toBe("go-root");
    match(press("g", 2_000));
    expect(match(press("t", 3_600))).toBeUndefined();
    match(press("g", 4_000));
    // Another key ends the sequence.
    expect(match(press("x", 4_100))).toBeUndefined();
    expect(match(press("s", 4_200))).toBeUndefined();
  });

  test("single keys", () => {
    const match = createShortcutMatcher();
    expect(match(press("["))).toBe("toggle-sidebar");
    expect(match(press("?"))).toBe("shortcuts");
    expect(match(press("n"))).toBe("new-list");
    expect(match(press("N"))).toBe("new-folder");
    expect(match(press("v"))).toBe("view-options");
    expect(match(press("m"))).toBe("move");
    expect(match(press("e"))).toBe("toggle-mode");
    expect(match(press("l"))).toBe("add-to-list");
    expect(match(press("c"))).toBe("capture");
    expect(match(press("o"))).toBe("open-in");
    expect(match(press("L"))).toBeUndefined();
    expect(match(press("v", 0, { metaKey: true }))).toBeUndefined();
  });

  test("nothing matches while typing in a text field, nor with ⌘, Ctrl or Alt, nor on repeat", () => {
    const match = createShortcutMatcher();
    const input = { target: { tagName: "INPUT" } };
    expect(match(press("g", 0, input))).toBeUndefined();
    // A sequence started outside a field doesn't end inside one.
    expect(match(press("g", 50))).toBe("pending");
    expect(match(press("u", 100, input))).toBeUndefined();
    expect(match(press("n", 0, { target: { isContentEditable: true } }))).toBeUndefined();
    expect(match(press("n", 0, { metaKey: true }))).toBeUndefined();
    expect(match(press("[", 0, { ctrlKey: true }))).toBeUndefined();
    expect(match(press("n", 0, { altKey: true }))).toBeUndefined();
    expect(match(press("n", 0, { repeat: true }))).toBeUndefined();
    expect(isTextField({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextField({ tagName: "A" })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });

  test("⌘K or Ctrl+K searches, even from a text field", () => {
    const match = createShortcutMatcher();
    const input = { target: { tagName: "INPUT" } };
    expect(match(press("k", 0, { metaKey: true }))).toBe("search");
    expect(match(press("k", 0, { ctrlKey: true, ...input }))).toBe("search");
    expect(match(press("K", 0, { metaKey: true, ...input }))).toBe("search");
    expect(match(press("k", 0, { metaKey: true, altKey: true }))).toBeUndefined();
    expect(match(press("k", 0, { metaKey: true, repeat: true }))).toBeUndefined();
    expect(match(press("k"))).toBeUndefined();
  });
});
