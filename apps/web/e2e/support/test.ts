// Every browser test's `test` (DRIFT-099, DRIFT-100): Playwright's, with a page that
// - fails the test on a Content Security Policy violation, which TON-126's guest page and a Sonner style both hit in
//   production while only three pages were watched; a test that means to trigger one says `cspViolations: "expected"`;
// - waits, before each key it presses, until no dialog is still closing: Base UI ignores keys during a dialog's exit
//   (200 ms), which twice lost a test's keystroke (TON-61, TON-63).
// Lint keeps the e2e files on this one (`.oxlintrc.json`).

import { expect, test as base } from "@playwright/test";

export * from "@playwright/test";

type Options = {
  /** Whether a CSP violation fails the test; `expected` for a test that triggers one on purpose. */
  cspViolations: "fail" | "expected";
};

export const test = base.extend<Options>({
  cspViolations: ["fail", { option: true }],
  page: async ({ page, cspViolations }, use) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    page.on("console", (message) => {
      const text = message.text();
      if (text.startsWith("CSP violation:") || text.includes("Content Security Policy"))
        violations.push(text);
    });
    const press = page.keyboard.press.bind(page.keyboard);
    page.keyboard.press = async (key, options) => {
      await page.waitForFunction(
        () => document.querySelector("[data-ending-style][role$='dialog']") === null,
      );
      return press(key, options);
    };
    await use(page);
    if (cspViolations === "fail") expect(violations, "CSP violations on the page").toEqual([]);
  },
});
