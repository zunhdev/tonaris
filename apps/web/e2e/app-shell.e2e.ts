// app-shell spec: the three-pane shell, the rendering modes (TS-03) and the root redirect (DS-30, DS-32).

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map(({ id, nodes }) => `${id} (${nodes.length})`)).toEqual([]);
  });
}
