// The Home Screen banner (DS-123, section 2.2, TON-323), on an iPhone emulated in Chromium and WebKit: it suggests
// installing Tonaris on the landing page and in the app, Install shows the steps, an app's built-in browser is sent to
// Safari with the link copied, and × closes it for good. The page ends above it while it shows. The installed app,
// Android and a computer show none. Firefox emulates no phone.

import { devices, expect, test, type Page } from "./support/test";
import { live, violations } from "./support/workspace";

declare global {
  interface Window {
    /** What the test's clipboard was given. */
    copied?: string;
  }
}

const { defaultBrowserType: _engine, ...iPhone } = devices["iPhone 15"];

const agents = {
  threads:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 400.0.0.0.0 (iPhone16,2; iOS 26_0; en_GB; en-GB; scale=3.00; 1290x2796; 123456789)",
  android:
    "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15",
};

test.skip(({ browserName }) => browserName === "firefox", "Firefox emulates no phone");
test.use(iPhone);

const banner = (page: Page) => page.getByRole("complementary", { name: "Install Tonaris" });

/** The bottom padding of the workspace's main pane, or of the landing page. */
const room = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => getComputedStyle(element).paddingBottom);

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the landing page suggests installing, Install shows the steps, and × closes it for good", async ({
    page,
  }) => {
    await page.goto("/welcome");
    await expect(banner(page)).toContainText("Install TonarisOpen it from your Home Screen");
    expect(await room(page, "[data-install-room]")).toBe("96px");
    expect(await violations(page, "[data-install-banner]")).toEqual([]);

    await banner(page).getByRole("button", { name: "Install" }).click();
    const sheet = page.getByRole("dialog", { name: "Install Tonaris" });
    // The second step's picture of the menu row is hidden from screen readers, not from the text.
    await expect(sheet.getByRole("listitem")).toHaveText([
      "Tap Share . If you don't see it, tap ⋯ beside the address first.",
      /^Tap Add to Home Screen\./,
      "Leave Open as Web App on, and tap Add.",
    ]);
    // Signed out, nothing to sign in to again.
    await expect(sheet).not.toContainText("sign in once more");
    await expect(sheet).toContainText(
      "No Add to Home Screen? Copy the link and open it in Safari.",
    );
    expect(await violations(page, '[role="dialog"]')).toEqual([]);
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);

    await banner(page).getByRole("button", { name: "Close" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(await room(page, "[data-install-room]")).toBe("0px");

    // Gone for good on this device, after a reload too.
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => localStorage.getItem("tonaris:install-banner"))).toBe(
      "closed",
    );
    await expect(banner(page)).toHaveCount(0);
  });
});

test("in the app, the steps say the installed app signs in once more, and the view ends above the banner", async ({
  page,
}) => {
  await page.goto("/c");
  await live(page);
  await expect(banner(page)).toBeVisible();
  expect(await room(page, '[data-page-scroll="main"]')).toBe("96px");
  const main = (await page.locator('[data-page-scroll="main"]').boundingBox())!;
  const bar = (await banner(page).boundingBox())!;
  // The main pane's content ends 96 px from the screen's bottom, above the banner's top.
  expect(main.y + main.height - 96).toBeLessThanOrEqual(bar.y);

  await banner(page).getByRole("button", { name: "Install" }).click();
  await expect(page.getByRole("dialog", { name: "Install Tonaris" })).toContainText(
    "The installed app has its own sign-in, so you'll sign in once more there.",
  );
});

test.describe("in an app's built-in browser", () => {
  test.use({ userAgent: agents.threads });

  test("Install says to open Tonaris in Safari, and copies the link", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            window.copied = text;
          },
        },
      });
    });
    await page.goto("/c");
    await live(page);
    await banner(page).getByRole("button", { name: "Install" }).click();
    const sheet = page.getByRole("dialog", { name: "Open Tonaris in Safari" });
    await expect(sheet).toContainText("This app's browser can't add Tonaris to your Home Screen.");
    expect(await violations(page, '[role="dialog"]')).toEqual([]);

    await sheet.getByRole("button", { name: "Copy link" }).click();
    await expect(sheet.getByRole("button", { name: "Link copied" })).toBeVisible();
    expect(await page.evaluate(() => window.copied)).toBe(page.url());
  });

  test("when the browser won't copy, the address is there to copy by hand", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async () => {
            throw new DOMException("Not allowed", "NotAllowedError");
          },
        },
      });
    });
    await page.goto("/c");
    await live(page);
    await banner(page).getByRole("button", { name: "Install" }).click();
    const sheet = page.getByRole("dialog", { name: "Open Tonaris in Safari" });
    await sheet.getByRole("button", { name: "Copy link" }).click();
    await expect(sheet.getByRole("textbox", { name: "Tonaris's address" })).toHaveValue(page.url());
  });
});

test("the installed app shows no banner", async ({ page }) => {
  // iOS's Home Screen app sets `navigator.standalone`.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true });
  });
  await page.goto("/c");
  await live(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  expect(await room(page, '[data-page-scroll="main"]')).toBe("0px");
});

test.describe("on Android", () => {
  test.use({ userAgent: agents.android });

  test("there's no banner: Chrome has its own install hint", async ({ page }) => {
    await page.goto("/c");
    await live(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe("on a computer", () => {
  test.use({
    userAgent: agents.macSafari,
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test("there's no banner", async ({ page }) => {
    await page.goto("/c");
    await live(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });
});
