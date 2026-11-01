// A guest's view of a share as kept for the visit (FR-11.9, DS-72): what it can read, and the defaults for the rest.

import { describe, expect, test } from "bun:test";

import { guestDefaults, guestViewOf } from "./guest-view";

describe("a guest's view (DS-72)", () => {
  test("reads each choice the domain knows", () => {
    expect(
      guestViewOf(JSON.stringify({ sort: "name", dir: "desc", grouped: true, layout: "grid" })),
    ).toEqual({ sort: "name", dir: "desc", grouped: true, layout: "grid" });
  });

  test("takes the first default for what it can't read, and manual order, which is the owner's", () => {
    expect(guestViewOf(JSON.stringify({ sort: "manual", dir: "up", layout: 3 }))).toEqual({
      sort: "year",
      dir: "asc",
      grouped: false,
      layout: "rows",
    });
    expect(guestViewOf("{not json")).toBe(guestDefaults);
    expect(guestViewOf(undefined)).toBe(guestDefaults);
  });
});
