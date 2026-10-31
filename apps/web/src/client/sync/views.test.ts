// The writes a change of the account defaults becomes (FR-11.7, FR-06.6): the view options as one `defaults.set`, the
// link setting as its own `defaults.setLinkTarget` (TON-104), and the services turned off as
// `defaults.setHiddenServices` (TON-138), each with the values it replaces as its base.

import { describe, expect, test } from "bun:test";

import { appAccountDefaults } from "@tonaris/domain";

import { defaultsWrites } from "./views";

/** The writes, without their mutation IDs. */
const sent = (next: Parameters<typeof defaultsWrites>[1]) =>
  defaultsWrites(appAccountDefaults, next).map(({ key, mutation }) => {
    const { mutationId: _, ...write } = mutation;
    return Object.assign(write, { key });
  });

describe("defaultsWrites", () => {
  test("view options and the link setting are separate writes", () => {
    expect(sent({ layout: "grid", linkTarget: "app" })).toEqual([
      { key: "defaults", name: "defaults.set", args: { layout: "grid" }, base: { layout: "rows" } },
      {
        key: "defaults",
        name: "defaults.setLinkTarget",
        args: { linkTarget: "app" },
        base: { linkTarget: "web" },
      },
    ]);
  });

  test("only what changed is sent", () => {
    expect(sent({ linkTarget: "app" }).map((write) => write.name)).toEqual([
      "defaults.setLinkTarget",
    ]);
    expect(sent({ layout: "rows", linkTarget: "web" })).toEqual([]);
  });

  test("the services turned off are their own write, sent only when the list changes (TON-138)", () => {
    expect(sent({ hiddenServices: ["qobuz"] })).toEqual([
      {
        key: "defaults",
        name: "defaults.setHiddenServices",
        args: { hiddenServices: ["qobuz"] },
        base: { hiddenServices: [] },
      },
    ]);
    expect(sent({ hiddenServices: [] })).toEqual([]);
  });
});
