// design-system spec: the dark theme and typography, as a browser renders them (DS-11, DS-13).

import { expect, test } from "@playwright/test";

for (const path of ["/c", "/sign-in"]) {
  test(`${path} loads dark`, async ({ page }) => {
    await page.goto(path);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveCSS("color-scheme", "dark");

    // Compare as the browser computes colors: the minified CSS spells oklch() values differently.
    const { background, expected } = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "oklch(0.155 0.006 265)"; // bg.app (DS-12)
      document.body.append(probe);
      const colors = {
        background: getComputedStyle(document.body).backgroundColor,
        expected: getComputedStyle(probe).backgroundColor,
      };
      probe.remove();
      return colors;
    });
    expect(background).toBe(expected);
  });
}

test("Inter Variable loads from the app's own origin", async ({ page, baseURL }) => {
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fonts.push(request.url());
  });
  await page.goto("/sign-in");
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('13px "Inter Variable"');
  });

  expect(loaded).toBe(true);
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.filter((url) => !url.startsWith(`${baseURL}/`))).toEqual([]);
});

test("text falls back to system fonts for scripts Inter lacks", async ({ page }) => {
  await page.goto("/sign-in");
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family.startsWith('"Inter Variable"')).toBe(true);
  expect(family).toContain("system-ui");
  expect(family).toContain("sans-serif");
});

test("the keyboard focus ring shows: a 2px solid focus outline (DS-115)", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.keyboard.press("Tab");
  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeFocused();
  await expect(continueButton).toHaveCSS("outline-style", "solid");
  await expect(continueButton).toHaveCSS("outline-width", "2px");
});

test("typed text in an input is fg.primary at 14px, 16px on a phone (DS-13, DS-110; TON-101)", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/sign-in");
  const field = page.getByRole("textbox").first();
  await field.fill("someone@example.com");
  const expected = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "oklch(0.95 0.004 265)"; // fg.primary (DS-12)
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(field).toHaveCSS("color", expected);
  await expect(field).toHaveCSS("font-size", "14px");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(field).toHaveCSS("font-size", "16px");
  await context.close();
});
