// The refusals a mutation meets before its command runs (TS-20, TS-22): a guest's, an ID in use, and a retry too old
// for its record to be kept.

import { describe, expect, test } from "bun:test";

import { uuidv7 } from "./ids";
import { guestMutationRefusal, mutationIdInUse, mutationTooOld, syncRetentionMs } from "./sync";

describe("mutation refusals (TS-20, TS-22)", () => {
  const now = new Date(Date.UTC(2026, 10, 1, 12, 0, 0));

  test("a mutation made inside the retention window runs; one made before it is expired", () => {
    expect(mutationTooOld(uuidv7(now.getTime()), now)).toBeUndefined();
    expect(mutationTooOld(uuidv7(now.getTime() - syncRetentionMs), now)).toBeUndefined();
    expect(mutationTooOld(uuidv7(now.getTime() - syncRetentionMs - 1), now)).toMatchObject({
      status: "failed",
      code: "expired",
      problem: {
        status: 410,
        detail: "This change is too old to be retried. Check the saved state and make it again.",
      },
    });
  });

  test("an ID without a time counts as made now", () => {
    expect(mutationTooOld(crypto.randomUUID(), now)).toBeUndefined();
  });

  test("a guest's mutation and an ID in use are refused as before", () => {
    expect(guestMutationRefusal).toMatchObject({
      code: "permission_denied",
      problem: { detail: "Guests can't change anything." },
    });
    expect(mutationIdInUse).toMatchObject({
      code: "validation_failed",
      problem: {
        detail: "This mutation ID is already in use.",
        errors: [{ path: "mutationId", message: "Already in use" }],
      },
    });
  });
});
