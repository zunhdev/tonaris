// The fallback orders and the custom fields' order (DS-44, DS-51, FR-03.6), which every client and the server's
// reads share. The sorts themselves are tested with the web app's views (apps/web/src/features/collection).

import { describe, expect, test } from "bun:test";

import { byBytes, entryOrder, sortFields, unsortedOrder } from "./order";

describe("byBytes", () => {
  test("compares by code unit, never by locale", () => {
    expect(["b", "B", "a", "A"].toSorted(byBytes)).toEqual(["A", "B", "a", "b"]);
    expect(byBytes("a0", "a0")).toBe(0);
  });
});

describe("fallback orders (DS-44, DS-51)", () => {
  test("a list's entries go as they were added, oldest first, ties by album ID", () => {
    const entries = [
      { addedAt: "2026-10-28T12:00:00.000Z", albumId: "c" },
      { addedAt: "2026-10-27T12:00:00.000Z", albumId: "d" },
      { addedAt: "2026-10-28T12:00:00.000Z", albumId: "a" },
    ];
    expect(entries.toSorted(entryOrder).map((entry) => entry.albumId)).toEqual(["d", "a", "c"]);
  });

  test("Unsorted goes newest first, by UUIDv7 ID", () => {
    const albums = [
      { id: "0190a000-0000-7000-8000-000000000000" },
      { id: "0190c000-0000-7000-8000-000000000000" },
      { id: "0190b000-0000-7000-8000-000000000000" },
    ];
    expect(albums.toSorted(unsortedOrder).map((album) => album.id.slice(0, 5))).toEqual([
      "0190c",
      "0190b",
      "0190a",
    ]);
  });
});

describe("sortFields (FR-03.6)", () => {
  test("by name ignoring case and accents, then bytewise, the same in every locale", () => {
    const fields = [{ name: "Éra" }, { name: "condition" }, { name: "Bitrate" }, { name: "era" }];
    expect(sortFields(fields).map((field) => field.name)).toEqual([
      "Bitrate",
      "condition",
      "era",
      "Éra",
    ]);
    expect(fields.map((field) => field.name)).toEqual(["Éra", "condition", "Bitrate", "era"]);
  });
});
