// The app's links into Help (TON-315): addresses, and the type check that keeps them pointing at pages and headings
// Help has. If the check stopped catching these, the `@ts-expect-error` lines would fail `tsc` themselves.

import { describe, expect, test } from "bun:test";

import { helpAddress, helpSearchAddress } from "./links";

describe("links into Help", () => {
  test("name Help's home, a page, or a heading on it", () => {
    expect(helpAddress()).toBe("/help");
    expect(helpAddress("trash/get-it-back")).toBe("/help/trash/get-it-back");
    expect(helpAddress("trash/get-it-back", "restore-something")).toBe(
      "/help/trash/get-it-back#restore-something",
    );
    expect(helpSearchAddress("dark mode & more")).toBe("/help/search?q=dark%20mode%20%26%20more");
  });

  test("can't name a page or a heading Help doesn't have", () => {
    // @ts-expect-error: no such page
    expect(helpAddress("trash/no-such-page")).toBe("/help/trash/no-such-page");
    // @ts-expect-error: a heading of another page
    expect(helpAddress("trash/get-it-back", "the-three-ways")).toContain("#the-three-ways");
  });
});
