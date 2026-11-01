// The command kit (TS-20, TS-21, TS-30): telling refusals apart, the outcomes it builds, the acting owner under the
// policy, and the compare-and-set checks.

import { describe, expect, test } from "bun:test";

import {
  actingOwner,
  applied,
  baseProblem,
  conflict,
  isFailure,
  nothingChanged,
  staleFields,
} from "./command-kit";
import type { CommandContext } from "./commands";
import { failure } from "./outcomes";
import type { Principal } from "./principals";
import { memoryStore } from "./testing";

const owner = "owner-id";
const user: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const manage: Principal = { kind: "mcp", userId: owner, grantId: "g1", mode: "manage" };
const readOnly: Principal = { ...manage, mode: "read_only" };
const guest: Principal = { kind: "guest", linkId: "l1", rootId: "r1" };
const contextOf = (principal: Principal): CommandContext => ({
  principal,
  store: memoryStore().store,
});

describe("isFailure", () => {
  test("tells a refusal from anything a lookup answers", () => {
    expect(isFailure(failure("not_found", "Gone."))).toBe(true);
    for (const value of ["owner-id", ["a", "b"], null, true, { status: "applied", changes: [] }]) {
      expect(isFailure(value)).toBe(false);
    }
    expect(isFailure({ id: "c1", kind: "list", name: "Doom" })).toBe(false);
  });
});

describe("outcomes", () => {
  test("applied lists its changes in order, none when it changes nothing", () => {
    expect(applied()).toEqual({ status: "applied", changes: [] });
    const change = { entity: "view", id: "root", op: "delete", data: null } as const;
    expect(applied(change, change)).toEqual({ status: "applied", changes: [change, change] });
  });

  test("a conflict carries `base` only when the change assumed one (TS-21)", () => {
    expect(conflict("name", "Doom", "Sludge", "Drone")).toEqual({
      status: "conflict",
      conflicts: [{ field: "name", current: "Doom", attempted: "Sludge", base: "Drone" }],
    });
    expect(conflict("description", "Heavy", null, null).conflicts[0]).toHaveProperty("base", null);
    expect(conflict("name", "Doom", "Sludge").conflicts[0]).not.toHaveProperty("base");
  });
});

describe("actingOwner (TS-30, X-03, FR-10.3)", () => {
  test("a person and a Manage collection agent act for their own account", () => {
    expect(actingOwner(contextOf(user), "collection", "No.")).toBe(owner);
    expect(actingOwner(contextOf(manage), "collection", "No.")).toBe(owner);
    expect(actingOwner(contextOf(user), "sharing", "No.")).toBe(owner);
  });

  test("a Read-only agent and a guest are refused; an agent never does app-only work", () => {
    expect(actingOwner(contextOf(readOnly), "collection", "You can't.")).toMatchObject({
      code: "permission_denied",
      problem: { detail: "You can't." },
    });
    expect(actingOwner(contextOf(manage), "sharing", "In the app.")).toMatchObject({
      code: "app_only",
      problem: { detail: "In the app." },
    });
    expect(actingOwner(contextOf(guest), "collection", "You can't.")).toMatchObject({
      code: "permission_denied",
      problem: { detail: "You can't." },
    });
    expect(actingOwner(contextOf(guest), "sharing", "In the app.", "Sign in.")).toMatchObject({
      code: "permission_denied",
      problem: { detail: "Sign in." },
    });
  });
});

describe("compare-and-set checks (TS-21)", () => {
  const fields = ["title", "artistCredit", "originalYear"] as const;

  test("an update names at least one field", () => {
    expect(nothingChanged()).toMatchObject({
      code: "validation_failed",
      problem: { errors: [{ path: "args", message: "Name at least one field" }] },
    });
  });

  test("`base` holds the prior value of exactly the changed fields", () => {
    expect(baseProblem(fields, ["title"], { title: "Dopesmoker" })).toBeUndefined();
    expect(
      baseProblem(fields, ["title", "originalYear"], { title: "A", artistCredit: "B" }),
    ).toMatchObject({
      code: "validation_failed",
      problem: {
        errors: [
          { path: "base.originalYear", message: "Required" },
          { path: "base.artistCredit", message: "Not changed by this mutation" },
        ],
      },
    });
  });

  test("a field is stale when its saved value isn't its base", () => {
    const current = { title: "Dopesmoker", artistCredit: "Sleep", originalYear: 2003 };
    expect(
      staleFields(
        ["title", "originalYear"],
        current,
        { title: "Jerusalem", originalYear: 1999 },
        { title: "Dopesmoker", originalYear: 1999 },
      ),
    ).toEqual([{ field: "originalYear", current: 2003, attempted: 1999, base: 1999 }]);
  });
});
