// design-system spec: the dark theme and typography, as a browser renders them (DS-11, DS-13), with frosted menus and
// filled fields (DS-16, DS-20; TON-168).

import { expect, test, type Page } from "@playwright/test";

for (const path of ["/c", "/sign-in"]) {
  test(`${path} loads dark`, async ({ page }) => {
    await page.goto(path);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveCSS("color-scheme", "dark");

    // Compare as the browser computes colors: the minified CSS spells oklch() values differently.
    const { background, expected } = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "oklch(0.16 0.021 274)"; // bg.app (DS-12, tinted in TON-167)
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

/** A CSS color as the browser computes it: the minified CSS spells oklch() values differently. */
const computedColor = (page: Page, value: string) =>
  page.evaluate((color) => {
    const probe = document.createElement("div");
    probe.style.setProperty("color", color);
    document.body.append(probe);
    const shown = getComputedStyle(probe).color;
    probe.remove();
    return shown;
  }, value);

test("fields are filled, with a faint edge that strengthens on hover (DS-20, TON-168)", async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/sign-in");
  const field = page.getByLabel("Email");
  // A headless browser refuses the passkey prompt, which marks the field invalid, with an edge of its own: once it has,
  // take the mark away to see the field's.
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await field.evaluate((element) => element.removeAttribute("aria-invalid"));
  await page.mouse.move(0, 0);
  await expect(field).toHaveCSS("background-color", await computedColor(page, "oklch(1 0 0 / 5%)"));
  // border.subtle at rest, border.strong under the pointer.
  await expect(field).toHaveCSS(
    "border-top-color",
    await computedColor(page, "oklch(0.26 0.026 274)"),
  );
  await field.hover();
  await expect(field).toHaveCSS(
    "border-top-color",
    await computedColor(page, "oklch(0.53 0.03 274)"),
  );
  await context.close();
});

test("menus and the palette are frosted (DS-16, TON-168)", async ({ page }) => {
  await page.goto("/c");
  await page.getByRole("button", { name: /^Account: / }).click();
  const menu = page.locator('[data-slot="dropdown-menu-content"]');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS("backdrop-filter", /blur\(24px\)/);
  await expect(menu).toHaveCSS(
    "background-color",
    await computedColor(page, "oklch(0.22 0.026 274 / 94%)"),
  );
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.locator('[data-slot="command-content"]')).toHaveCSS(
    "backdrop-filter",
    /blur\(24px\)/,
  );
});

test("text falls back to system fonts for scripts Inter lacks", async ({ page }) => {
  await page.goto("/sign-in");
  // WebKit reports the family without the quotes Chromium keeps.
  const family = (await page.evaluate(() => getComputedStyle(document.body).fontFamily)).replaceAll(
    '"',
    "",
  );
  expect(family.startsWith("Inter Variable")).toBe(true);
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
    probe.style.color = "oklch(0.955 0.008 274)"; // fg.primary (DS-12, tinted in TON-167)
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
