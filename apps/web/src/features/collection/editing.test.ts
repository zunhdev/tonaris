// Creating and renaming in the sidebar (FR-01.1, FR-01.3, DS-78, DS-107), and what the device remembers (DS-32).

import { describe, expect, test } from "bun:test";

import { uuidv7, type Container } from "@tonaris/domain";

import { isCollectionPath } from "../shell/device";
import { createEditing, nameRefusal, placeFor } from "./editing";

const metal: Container = {
  id: uuidv7(),
  kind: "folder",
  parentId: null,
  name: "Metal",
  description: null,
};
const doom: Container = {
  id: uuidv7(),
  kind: "list",
  parentId: metal.id,
  name: "Doom",
  description: null,
};
const later: Container = {
  id: uuidv7(),
  kind: "list",
  parentId: null,
  name: "Later",
  description: null,
};

describe("creating and renaming (DS-78)", () => {
  test("a new folder or list goes into the focused folder, else the current view's, else the root", () => {
    expect(placeFor(metal, undefined)).toBe(metal.id);
    // A focused list's parent, before the view.
    expect(placeFor(doom, later)).toBe(metal.id);
    expect(placeFor(later, metal)).toBeNull();
    expect(placeFor(undefined, metal)).toBe(metal.id);
    expect(placeFor(undefined, doom)).toBe(metal.id);
    expect(placeFor(undefined, undefined)).toBeNull();
  });

  test("a blank, overlong or taken name is refused in the domain's words (DS-107)", () => {
    expect(nameRefusal("  ", { siblings: [], parentName: null })).toBe(
      "Give the folder or list a name.",
    );
    expect(nameRefusal("x".repeat(201), { siblings: [], parentName: null })).toBe(
      "Names can be at most 200 characters.",
    );
    expect(nameRefusal(" later ", { siblings: [metal, later], parentName: null })).toBe(
      "'Later' already exists at the top level. Choose another name.",
    );
    expect(nameRefusal("DOOM", { siblings: [doom], parentName: "Metal" })).toBe(
      "'Doom' already exists in Metal. Choose another name.",
    );
    // A case-only rename of the same list is allowed.
    expect(nameRefusal("DOOM", { siblings: [doom], selfId: doom.id, parentName: "Metal" })).toBe(
      undefined,
    );
    expect(nameRefusal("Funeral", { siblings: [doom], parentName: "Metal" })).toBeUndefined();
  });

  test("one editor at a time, and listeners hear each change", () => {
    const editing = createEditing();
    let heard = 0;
    editing.subscribe(() => {
      heard += 1;
    });
    editing.start({ mode: "create", kind: "list", parentId: null, name: "" });
    editing.start({ mode: "rename", id: doom.id, name: "Doom" });
    expect(editing.current).toEqual({ mode: "rename", id: doom.id, name: "Doom" });
    editing.stop();
    editing.stop();
    expect(editing.current).toBeUndefined();
    expect(heard).toBe(3);
  });
});

describe("the last view (DS-32)", () => {
  test("only collection views' paths are remembered for /", () => {
    for (const path of [
      "/c",
      "/unsorted",
      "/trash",
      "/shared",
      `/f/${metal.id}`,
      `/l/${doom.id}`,
    ]) {
      expect(isCollectionPath(path)).toBe(true);
    }
    for (const path of [
      "/",
      "/settings/connections",
      "/f/not-an-id",
      `/l/${doom.id}/extra`,
      "//evil.example",
      "https://evil.example/c",
    ]) {
      expect(isCollectionPath(path)).toBe(false);
    }
  });
});
