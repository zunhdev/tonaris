// app-shell spec: the three-pane shell, the rendering modes (TS-03) and the root redirect (DS-30, DS-32).

import { expect, test } from "@playwright/test";

import { pageViolations } from "./support/workspace";

test.describe("three-pane desktop shell", () => {
  test("the workspace opens in the shell", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/c");

    const sidebar = page.getByRole("navigation", { name: "Sidebar" });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("Tonaris", { exact: true })).toBeVisible();
    expect((await sidebar.boundingBox())?.width).toBe(240);

    await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
    await expect(page.getByRole("complementary")).toHaveCount(0);
  });

  test("the sidebar's logo and name go to Collection", async ({ page }) => {
    await page.goto("/unsorted");
    const sidebar = page.getByRole("navigation", { name: "Sidebar" });
    await sidebar.getByRole("link", { name: "Tonaris, go to Collection" }).click();
    await expect(page).toHaveURL(/\/c$/);
    await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
  });

  test("a page with no scroll area of its own scrolls in the main pane, never the window, and the sidebar stays", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 360 });
    await page.goto("/settings/account");
    const main = page.getByRole("main", { name: "Account" });
    await expect(main).toBeVisible();
    const sidebar = page.getByRole("navigation", { name: "Sidebar" });

    // The window can't scroll: the sidebar would go with it and leave a blank band below (TON-158).
    const windowState = () =>
      page.evaluate(() => {
        window.scrollTo(0, 1000);
        return { height: document.documentElement.scrollHeight, scrolled: window.scrollY };
      });
    expect(await windowState()).toEqual({ height: 360, scrolled: 0 });

    // The main pane scrolls instead, and the sidebar stays put.
    await main.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect((await sidebar.boundingBox())?.y).toBe(0);
    expect(await windowState()).toEqual({ height: 360, scrolled: 0 });

    // Another page starts at its top (TON-157).
    await page
      .getByRole("navigation", { name: "Settings" })
      .getByRole("link", { name: "Profile" })
      .click();
    const profile = page.getByRole("main", { name: "Profile" });
    await expect(profile).toBeVisible();
    await expect.poll(() => profile.evaluate((element) => element.scrollTop)).toBe(0);
  });

  test("panes are named landmarks", async ({ page }) => {
    await page.goto("/c");
    await expect(page.getByRole("navigation", { name: "Sidebar" })).toHaveCount(1);
    await expect(page.getByRole("main", { name: "Collection" })).toHaveCount(1);
  });
});

test.describe("rendering modes", () => {
  test("the server sends no workspace content; the browser renders it", async ({
    page,
    request,
  }) => {
    const html = await (await request.get("/c")).text();
    expect(html).toContain('data-theme="dark"');
    expect(html).not.toContain("Start your collection");
    expect(html).not.toContain('aria-label="Sidebar"');

    await page.goto("/c");
    await expect(
      page.getByText("Start your collection — paste an album link or create a list."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New list", exact: true })).toBeVisible();
  });

  test("sign-in arrives rendered", async ({ request }) => {
    const html = await (await request.get("/sign-in")).text();
    expect(html).toMatch(/<h1[^>]*>Sign in<\/h1>/);
  });
});

test("visiting the root lands on the collection", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/c$/);
  await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
});

for (const path of ["/c", "/sign-in"]) {
  test(`${path} has no axe violations`, async ({ page }) => {
    await page.goto(path);
    await page.getByRole("main").waitFor();
    const violations = await pageViolations(page);
    expect(violations.map(({ id, nodes }) => `${id} (${nodes.length})`)).toEqual([]);
  });
}
