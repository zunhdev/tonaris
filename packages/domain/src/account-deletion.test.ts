// Who may delete their account (FR-11.10, DS-97): one rule, which the database and the Settings page both ask
// (DRIFT-059).

import { describe, expect, test } from "bun:test";

import { accountDeletionRefusal, accountDeletionRefusalDetails } from "./accounts";

describe("accountDeletionRefusal", () => {
  test("the creator's account can't be deleted, one being deleted is underway, anyone else's can", () => {
    expect(accountDeletionRefusal({ role: "creator" })).toBe("creator");
    expect(accountDeletionRefusal({ role: "user", deletingAt: new Date() })).toBe("deleting");
    expect(accountDeletionRefusal({ role: "user", deletingAt: null })).toBeUndefined();
    expect(accountDeletionRefusalDetails.creator).toContain("can't be deleted");
  });
});
