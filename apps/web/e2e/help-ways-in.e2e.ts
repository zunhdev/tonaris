// The ways into Help (FR-16.5, DS-122, TON-315): the landing page's header and footer and the sign-in card lead to
// Help; inside the app, the account menu, ⌘K's Open help and "Search help for '…'", the ? sheet, and "Learn more"
// where people hesitate open the right page or section, in a new tab, so the workspace keeps its place.

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test, type Page } from "./support/test";
import { violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

/** Where the tab `open` opens goes: its path, search and anchor. The tab is closed after. */
async function newTab(page: Page, open: () => Promise<void>): Promise<string> {
  const [tab] = await Promise.all([page.context().waitForEvent("page"), open()]);
  await tab.waitForLoadState();
  const url = new URL(tab.url());
  await tab.close();
  return url.pathname + url.search + url.hash;
}

test("the landing page and sign-in lead to Help", async ({ page }) => {
  await page.goto("/welcome");
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Help", exact: true }),
  ).toHaveAttribute("href", "/help");
  await page.getByRole("banner").getByRole("link", { name: "Help", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tonaris Help" })).toBeVisible();

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Help", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tonaris Help" })).toBeVisible();
});

test("inside the app, Help opens in a new tab from the menu, ⌘K, the ? sheet and Learn more", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, accounts.helpWaysIn);

  // An empty collection offers the first ten minutes.
  const firstSteps = page.getByRole("link", { name: /^Learn more about getting started/ });
  await expect(firstSteps).toHaveAttribute("href", "/help/start-here/your-first-ten-minutes");
  expect(await violations(page, "main")).toEqual([]);

  await page.getByRole("button", { name: /^Account:/ }).click();
  expect(await newTab(page, () => page.getByRole("menuitem", { name: "Help" }).click())).toBe(
    "/help",
  );

  // Keys wait until the menu has gone.
  await expect(page.getByRole("menu")).toBeHidden();
  const palette = page.getByRole("dialog", { name: "Search" });
  const field = palette.getByRole("combobox", { name: "Search" });
  await page.keyboard.press("ControlOrMeta+k");
  await field.fill("dark mode");
  await expect(palette.getByText("No results for 'dark mode'.")).toBeVisible();
  const searchHelp = palette.getByRole("option", { name: /^Search help for 'dark mode'/ });
  expect(await newTab(page, () => searchHelp.click())).toBe("/help/search?q=dark%20mode");
  await expect(palette).toBeHidden();

  await page.keyboard.press("ControlOrMeta+k");
  await field.fill("> help");
  await expect(palette.getByRole("option", { name: /^Open help/ })).toBeVisible();
  expect(await newTab(page, () => page.keyboard.press("Enter"))).toBe("/help");

  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet.getByRole("link", { name: /^open Help/ })).toHaveAttribute(
    "href",
    "/help/reference/keyboard-shortcuts",
  );
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // "Learn more" opens the section it's about.
  const learnMore: [string, RegExp, string][] = [
    [
      "/settings/connections",
      /^Learn more about what an agent may do/,
      "/help/agents/connect#choose-what-the-agent-may-do",
    ],
    ["/settings/custom-fields", /^Learn more about custom fields/, "/help/fields/custom-fields"],
    ["/settings/data", /^Learn more about exports/, "/help/account/export"],
    ["/trash", /^Learn more about Trash/, "/help/trash/get-it-back"],
  ];
  for (const [view, name, help] of learnMore) {
    // One view after another.
    // oxlint-disable-next-line no-await-in-loop
    await page.goto(view);
    // oxlint-disable-next-line no-await-in-loop
    expect(await newTab(page, () => page.getByRole("link", { name }).click())).toBe(help);
  }
});
