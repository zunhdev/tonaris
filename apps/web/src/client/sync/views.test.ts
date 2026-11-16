// The writes a change of the account defaults becomes (FR-11.7, FR-06.6): the view options as one `defaults.set`, the
// link setting as its own `defaults.setLinkTarget` (TON-104), the services turned off as `defaults.setHiddenServices`
// (TON-138), and their order as `defaults.setServiceOrder` (TON-282), each with the values it replaces as its base.

import { describe, expect, test } from "bun:test";

import { appAccountDefaults, type AccountDefaults } from "@tonaris/domain";

import { defaultsWrites } from "./views";

/** The writes, without their mutation IDs. */
const sent = (
  next: Parameters<typeof defaultsWrites>[1],
  before: Parameters<typeof defaultsWrites>[0] = appAccountDefaults,
) =>
  defaultsWrites(before, next).map((mutation) => {
    const { mutationId: _, ...write } = mutation;
    return write;
  });

describe("defaultsWrites", () => {
  test("view options and the link setting are separate writes", () => {
    expect(sent({ layout: "grid", linkTarget: "app" })).toEqual([
      { name: "defaults.set", args: { layout: "grid" }, base: { layout: "rows" } },
      {
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
        name: "defaults.setHiddenServices",
        args: { hiddenServices: ["qobuz"] },
        base: { hiddenServices: [] },
      },
    ]);
    expect(sent({ hiddenServices: [] })).toEqual([]);
  });

  test("the same services in another order are no change, as the server compares them (TON-147)", () => {
    const before: AccountDefaults = { ...appAccountDefaults, hiddenServices: ["spotify", "qobuz"] };
    expect(sent({ hiddenServices: ["qobuz", "spotify"] }, before)).toEqual([]);
  });

  test("the services' order is its own write, sent only when the filled-out order changes (TON-282)", () => {
    expect(sent({ serviceOrder: ["tidal", "spotify"] })).toEqual([
      {
        name: "defaults.setServiceOrder",
        args: { serviceOrder: ["tidal", "spotify"] },
        base: { serviceOrder: [] },
      },
    ]);
    // The services' own order, written out, is the order an empty one stands for.
    expect(
      sent({ serviceOrder: ["spotify", "apple-music", "qobuz", "tidal", "youtube-music"] }),
    ).toEqual([]);
  });
});
