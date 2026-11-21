// Help's page list and search sections (TS-136): the committed src/help/pages.gen.ts and search.gen.json are what
// the pages make now, so a page added, renamed or retitled can't leave the sidebar, the home, the app's links or
// search behind. Generating them also checks the links between pages and the pictures they name.

import { describe, expect, test } from "bun:test";

import { generateHelpFiles } from "./help-pages";

const committed = (name: string) =>
  Bun.file(new URL(`../src/help/${name}`, import.meta.url)).text();

describe("help pages", () => {
  test("pages.gen.ts and search.gen.json are current: run `bun scripts/help-pages.ts` in apps/web after changing a page", async () => {
    const next = await generateHelpFiles();
    expect(next.pages).toBe(await committed("pages.gen.ts"));
    expect(next.search).toBe(await committed("search.gen.json"));
  });
});
