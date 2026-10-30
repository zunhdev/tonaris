// What Tonaris is, on the sign-in page (TON-116, DS-90): beside the card on the desktop and below it on a phone, on
// both sign-in steps, with nothing for axe; pages that only share the frame don't show it.

import { expect, test, type Page } from "@playwright/test";

import { violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const promo = (page: Page) => page.getByRole("region", { name: "Your albums, organized your way" });
const card = (page: Page) => page.getByRole("textbox", { name: "Email" });

async function box(locator: ReturnType<Page["locator"]>) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("Not laid out");
  return found;
}

test("the sign-in page says what Tonaris is, beside the card or below it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/sign-in");
  await expect(promo(page).getByRole("heading", { level: 3 })).toHaveText([
    "Your AI agents, through MCP",
    "Folders within folders, and lists",
    "Share a folder or a list",
    "Your data stays yours",
  ]);
  await expect(promo(page)).toContainText("Tonaris is invitation-only for now.");
  expect((await box(promo(page))).x).toBeLessThan((await box(card(page))).x);
  expect(await violations(page, "main")).toEqual([]);

  // On a phone, the card comes first.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await box(card(page))).y < (await box(promo(page))).y).toBe(true);

  // The code step keeps it.
  await page.setViewportSize({ width: 1280, height: 800 });
  await card(page).fill("promo-visitor@e2e.tonaris.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Check promo-visitor@e2e.tonaris.test" }),
  ).toBeVisible();
  await expect(promo(page)).toBeVisible();
});

test("pages that only share the sign-in frame don't show it", async ({ page }) => {
  await page.goto("/account-deleted");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(promo(page)).toHaveCount(0);
});
