// Counts in words (DS-19).

import { expect, test } from "bun:test";

import { count } from "./words";

test("a count takes its noun's singular for one, and its plural otherwise", () => {
  expect(count(1, "album", "albums")).toBe("1 album");
  expect(count(0, "album", "albums")).toBe("0 albums");
  expect(count(3, "folder or list", "folders and lists")).toBe("3 folders and lists");
});
