// Help's page list (TS-136): the committed src/help/pages.gen.ts is what the pages make now, so a page added,
// renamed or retitled can't leave the sidebar, the home or the app's links behind. Generating it also checks the
// links between pages and the pictures they name.

import { describe, expect, test } from "bun:test";

import { generateHelpPages } from "./help-pages";

describe("help pages", () => {
  test("pages.gen.ts is current: run `bun scripts/help-pages.ts` in apps/web after changing a page", async () => {
    const committed = await Bun.file(new URL("../src/help/pages.gen.ts", import.meta.url)).text();
    expect(await generateHelpPages()).toBe(committed);
  });
});
