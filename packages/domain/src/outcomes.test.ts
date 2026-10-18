import { describe, expect, test } from "bun:test";

import {
  errorCodes,
  type Outcome,
  outcomeSchema,
  outcomeStatuses,
  problemSchema,
} from "./outcomes";

const problem = {
  type: "about:blank",
  title: "Conflict",
  status: 409,
  code: "name_conflict",
  detail: "A list named “Favorites” already exists here.",
} as const;

describe("outcome vocabulary (TS-27)", () => {
  test("has the eight statuses, including the client-only pending and unconfirmed", () => {
    expect(outcomeStatuses).toEqual([
      "pending",
      "confirmed",
      "failed",
      "conflict",
      "unconfirmed",
      "needs_input",
      "needs_approval",
      "skipped",
    ]);
  });

  test("names every error code once", () => {
    expect(new Set(errorCodes).size).toBe(errorCodes.length);
    expect(errorCodes).toContain("internal_error");
  });

  test("accepts each server outcome", () => {
    const outcomes: Outcome[] = [
      { status: "confirmed", seq: 42, result: { id: "a1" } },
      { status: "failed", code: "name_conflict", problem },
      {
        status: "conflict",
        conflicts: [{ field: "title", current: "B", attempted: "C", base: "A" }],
      },
      { status: "needs_input", need: "destination", candidates: [] },
      { status: "needs_approval", approvalId: "ap1" },
      { status: "skipped", dependsOn: "m1", because: "failed" },
    ];
    for (const outcome of outcomes) expect(outcomeSchema.parse(outcome)).toEqual(outcome);
  });

  test("rejects client-only statuses, unknown codes and empty conflicts from the server", () => {
    expect(outcomeSchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(outcomeSchema.safeParse({ status: "unconfirmed" }).success).toBe(false);
    expect(outcomeSchema.safeParse({ status: "conflict", conflicts: [] }).success).toBe(false);
    expect(problemSchema.safeParse({ ...problem, code: "oops" }).success).toBe(false);
  });
});
