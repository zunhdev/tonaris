import { describe, expect, test } from "bun:test";

import {
  albumDeletionScope,
  approvalConsequences,
  approvalState,
  approvalSummary,
  canonicalJson,
  scopeHash,
} from "./approvals";

const a = "01a15f00-0000-7000-8000-00000000000a";
const b = "01a15f00-0000-7000-8000-00000000000b";
const list1 = "01a15f00-0000-7000-8000-0000000000c1";
const list2 = "01a15f00-0000-7000-8000-0000000000c2";

const album = (id: string, lists: { id: string; name: string }[] = []) => ({
  id,
  title: `Title ${id.slice(-1)}`,
  artist: "Someone",
  lists,
});

describe("the scope of a gated operation (TS-64)", () => {
  test("is canonical: the same deletion hashes the same whatever the order", async () => {
    const one = albumDeletionScope([
      album(b, [
        { id: list2, name: "Two" },
        { id: list1, name: "One" },
      ]),
      album(a),
    ]);
    const other = albumDeletionScope([
      album(a),
      album(b, [
        { id: list1, name: "One" },
        { id: list2, name: "Two" },
      ]),
    ]);
    expect(one).toEqual(other);
    expect(await scopeHash(one)).toBe(await scopeHash(other));
    expect(await scopeHash(one)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("hashes differently once an album leaves one more list", async () => {
    const before = albumDeletionScope([album(a, [{ id: list1, name: "One" }])]);
    const grown = albumDeletionScope([
      album(a, [
        { id: list1, name: "One" },
        { id: list2, name: "Two" },
      ]),
    ]);
    expect(await scopeHash(grown)).not.toBe(await scopeHash(before));
  });

  test("canonical JSON sorts keys at every level and keeps array order", () => {
    expect(canonicalJson({ b: [{ y: 1, x: 2 }], a: "s", c: undefined })).toBe(
      '{"a":"s","b":[{"x":2,"y":1}]}',
    );
  });
});

describe("the approval page's words (DS-87)", () => {
  test("say what moves to Trash, which lists it leaves, and for how long it can be recovered", () => {
    const scope = albumDeletionScope([
      album(a, [{ id: list1, name: "One" }]),
      album(b, [
        { id: list1, name: "One" },
        { id: list2, name: "Two" },
      ]),
    ]);
    expect(approvalSummary(scope)).toBe("Move 2 albums to Trash");
    expect(approvalConsequences(scope)).toEqual([
      "They leave 2 lists and Unsorted.",
      "They can be recovered from Trash for 30 days.",
    ]);
    expect(approvalSummary(albumDeletionScope([album(a)]))).toBe("Move 1 album to Trash");
  });
});

describe("an approval's state", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const later = new Date("2026-10-21T12:30:00Z");
  const earlier = new Date("2026-10-21T11:30:00Z");

  test("is pending or approved until it expires, approved ones included", () => {
    expect(approvalState({ status: "pending", expiresAt: later }, now)).toBe("pending");
    expect(approvalState({ status: "approved", expiresAt: later }, now)).toBe("approved");
    expect(approvalState({ status: "pending", expiresAt: earlier }, now)).toBe("expired");
    expect(approvalState({ status: "approved", expiresAt: earlier }, now)).toBe("expired");
  });

  test("stays declined or used after the expiry", () => {
    expect(approvalState({ status: "declined", expiresAt: earlier }, now)).toBe("declined");
    expect(approvalState({ status: "used", expiresAt: earlier }, now)).toBe("used");
  });
});
