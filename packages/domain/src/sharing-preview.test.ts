// A sharing preview's question (DS-69; FR-07.9, FR-07.10): where a move or a recovery may go, what is not found, and
// where a recovery goes by default, including the root when its folder is gone or in Trash.

import { describe, expect, test } from "bun:test";

import type { ImpactState } from "./sharing-impact";
import { impactOf } from "./sharing-preview";

const container = (id: string, parentId: string | null = null, trashed = false) => ({
  id,
  name: id,
  parentId,
  trashed,
});

const state: ImpactState & { folders: ReadonlySet<string> } = {
  containers: [
    container("metal"),
    container("doom", "metal"),
    container("heavy", "metal"),
    container("binned", null, true),
    container("lost", "binned", true),
    container("stray", "purged", true),
  ],
  people: [{ containerId: "metal", personId: "anna", name: "Anna", pending: false }],
  links: [],
  folders: new Set(["metal", "heavy", "binned"]),
};

/** A list's own Trash unit. */
const unit = (rootId: string) => ({ kind: "list", rootId, memberIds: [rootId] }) as const;

describe("impactOf (DS-69)", () => {
  test("a move goes into an active folder of the owner's, or the root, and not into itself", () => {
    expect(impactOf(state, { kind: "move", id: "doom", to: null })).toMatchObject({
      removed: [{ id: "anna" }],
    });
    expect(impactOf(state, { kind: "move", id: "doom", to: "heavy" })).toMatchObject({
      added: [],
      removed: [],
    });
    expect(impactOf(state, { kind: "move", id: "metal", to: "heavy" })).toBe("invalid");
    expect(impactOf(state, { kind: "move", id: "doom", to: "doom" })).toBe("invalid");
    expect(impactOf(state, { kind: "move", id: "doom", to: "binned" })).toBe("invalid");
    expect(impactOf(state, { kind: "move", id: "lost", to: null })).toBe("not_found");
    expect(impactOf(state, { kind: "move", id: "nothing", to: null })).toBe("not_found");
  });

  test("a recovery needs its unit, and an album's goes back to its lists", () => {
    expect(impactOf(state, { kind: "recover", unitId: "u" })).toBe("not_found");
    const album = { kind: "album", rootId: "a", listIds: ["doom"] } as const;
    expect(impactOf(state, { kind: "recover", unitId: "u" }, album)).toMatchObject({
      added: [{ id: "anna", via: { id: "metal" } }],
    });
  });

  test("by default a unit returns to its folder, or is previewed at the root when that folder isn't active", () => {
    const inMetal = {
      ...state,
      containers: [...state.containers, container("back", "metal", true)],
    };
    expect(impactOf(inMetal, { kind: "recover", unitId: "u" }, unit("back"))).toMatchObject({
      added: [{ id: "anna" }],
    });
    // `trash.recover` asks for a destination here; the preview assumes the root.
    expect(impactOf(state, { kind: "recover", unitId: "u" }, unit("lost"))).toEqual({
      added: [],
      removed: [],
      direct: [],
    });
    expect(impactOf(state, { kind: "recover", unitId: "u" }, unit("stray"))).toEqual({
      added: [],
      removed: [],
      direct: [],
    });
    expect(impactOf(state, { kind: "recover", unitId: "u", to: "binned" }, unit("lost"))).toBe(
      "invalid",
    );
  });
});
