// The checks /v1's resources share (X-03, FR-11.6): an account's settings are its own, in the app; administration is
// the creator's; and each refusal is the problem the routes document.

import { describe, expect, test } from "bun:test";

import type { Principal } from "@tonaris/domain";

import { ProblemError } from "../../problem";
import { authorizeAccount, refused, requireCreator } from "./common";

const anna: Principal = { kind: "user", userId: "anna", role: "user", client: "web" };
const creator: Principal = { kind: "user", userId: "creator", role: "creator", client: "web" };
const agent: Principal = { kind: "mcp", userId: "anna", grantId: "grant", mode: "manage" };

/** The problem `act` throws, if it throws one. */
function thrown(act: () => void): Pick<ProblemError, "status" | "code" | "detail"> | undefined {
  try {
    act();
  } catch (error) {
    if (!(error instanceof ProblemError)) throw error;
    return { status: error.status, code: error.code, detail: error.detail };
  }
  return undefined;
}

describe("authorizeAccount", () => {
  test("lets the account act on itself in the app, and refuses anyone else with the route's words", () => {
    const refusal = "Your passkeys are managed in the app.";
    expect(thrown(() => authorizeAccount(anna, "anna", refusal))).toBeUndefined();
    for (const principal of [agent, creator]) {
      expect(thrown(() => authorizeAccount(principal, "anna", refusal))).toEqual({
        status: 403,
        code: "permission_denied",
        detail: refusal,
      });
    }
  });
});

describe("requireCreator", () => {
  test("lets the creator through, and refuses everyone else", () => {
    expect(thrown(() => requireCreator(creator))).toBeUndefined();
    expect(thrown(() => requireCreator(anna))).toEqual({
      status: 403,
      code: "permission_denied",
      detail: "Only the creator can do this.",
    });
  });
});

test("refused is a 422 validation_failed with its reason", () => {
  expect(
    thrown(() => {
      throw refused("That isn't an email address.");
    }),
  ).toEqual({ status: 422, code: "validation_failed", detail: "That isn't an email address." });
});
