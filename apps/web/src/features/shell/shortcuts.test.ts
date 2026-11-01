// The workspace's keyboard shortcuts (DS-78).

import { describe, expect, test } from "bun:test";

import {
  commands,
  createShortcutMatcher,
  frequentCommands,
  isTextField,
  shortcutLabel,
  shortcutReference,
  type KeyPress,
} from "./shortcuts";

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
    expect(match(press("S"))).toBe("share");
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

describe("the reference and the palette (DS-78)", () => {
  const entries = shortcutReference.flatMap((section) => section.keys);

  test("every command is in the reference once, with its keys", () => {
    for (const { title, keys } of commands) {
      expect(entries.filter((entry) => entry.action === title)).toEqual([{ keys, action: title }]);
    }
  });

  test("every single-key shortcut the matcher knows is a command", () => {
    const match = createShortcutMatcher();
    const ids = new Set<string>(commands.map(({ id }) => id));
    for (const key of ["[", "?", "n", "N", "S", "v", "m", "e", "l", "c", "o", "Backspace"]) {
      expect(ids.has(String(match(press(key))))).toBe(true);
    }
    expect(ids.has(String(match(press("Backspace", 0, { metaKey: true }))))).toBe(true);
  });
});

describe("a menu's shortcuts (TON-117)", () => {
  test("are the commands' keys, run together", () => {
    const menu = ["new-list", "new-folder", "rename", "move", "share", "delete"] as const;
    expect(menu.map((id) => shortcutLabel(id))).toEqual(["N", "⇧N", "F2", "M", "⇧S", "⌫"]);
  });
});

describe("frequent commands (DS-75)", () => {
  test("the starter set before any history", () => {
    expect(frequentCommands({})).toEqual([
      "capture",
      "new-list",
      "go-unsorted",
      "toggle-mode",
      "shortcuts",
    ]);
  });

  test("the most run first, ties in list order, topped up from the starter set", () => {
    expect(frequentCommands({ "go-trash": 3, move: 1, "new-list": 3 })).toEqual([
      "go-trash",
      "new-list",
      "move",
      "capture",
      "go-unsorted",
    ]);
  });
});
