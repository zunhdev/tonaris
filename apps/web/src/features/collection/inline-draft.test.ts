// What an inline editor's keys do to its draft (DS-45): Enter commits, Shift+Enter adds a line where text can have
// several, and Escape discards, or, for an editor that lets it through once saved, goes on to the page.

import { describe, expect, test } from "bun:test";

import { draftKeyAction } from "./inline-draft";

const press = (key: string, shiftKey = false) => ({ key, shiftKey });
const oneLine = { multiline: false, escape: "always", open: true } as const;

describe("an inline draft's keys (DS-45)", () => {
  test("Enter commits; over several lines, Shift+Enter is the field's", () => {
    expect(draftKeyAction(press("Enter"), oneLine)).toBe("commit");
    expect(draftKeyAction(press("Enter", true), oneLine)).toBe("commit");
    expect(draftKeyAction(press("Enter", true), { ...oneLine, multiline: true })).toBeUndefined();
    expect(draftKeyAction(press("Enter"), { ...oneLine, multiline: true })).toBe("commit");
  });

  test("Escape discards, or once nothing is open goes on where the editor says so", () => {
    expect(draftKeyAction(press("Escape"), { ...oneLine, open: false })).toBe("discard");
    expect(draftKeyAction(press("Escape"), { ...oneLine, escape: "open" })).toBe("discard");
    expect(
      draftKeyAction(press("Escape"), { ...oneLine, escape: "open", open: false }),
    ).toBeUndefined();
  });

  test("other keys are the field's", () => {
    expect(draftKeyAction(press("a"), oneLine)).toBeUndefined();
    expect(draftKeyAction(press("Tab"), oneLine)).toBeUndefined();
  });
});
