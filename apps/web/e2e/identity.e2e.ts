// The identity in a real browser (TON-114, TON-154, DS-19): the mark and the name on the sign-in page and in the
// sidebar, and the icons the page names served from the web app.

import { expect, test } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { live } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

test("the sign-in page and the sidebar show the mark and the name, and the icons are served", async ({
  page,
  request,
}) => {
  await page.goto("/sign-in");
  // The wordmark above the card, a link to the landing page (TON-155).
  const wordmark = page.getByRole("main").locator("p:visible", { hasText: "Tonaris" });
  await expect(wordmark.locator('svg[data-slot="logo"]')).toBeVisible();

  const icons = await page
    .locator('head link[rel="icon"], head link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(icons).toEqual(["/favicon.svg", "/favicon-32.png", "/apple-touch-icon.png"]);
  for (const [href, type] of [
    ["/favicon.svg", "image/svg+xml"],
    ["/favicon-32.png", "image/png"],
    ["/apple-touch-icon.png", "image/png"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- three small files, one after another
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    expect(response.headers()["content-type"], href).toContain(type);
  }

  await signIn(page, accounts.identity);
  await live(page);
  const sidebar = page.getByRole("navigation", { name: "Sidebar" });
  await expect(sidebar.getByText("Tonaris", { exact: true })).toBeVisible();
  await expect(sidebar.locator('svg[data-slot="logo"]')).toBeVisible();
});
