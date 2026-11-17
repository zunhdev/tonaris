// Tonaris as an installed app on a computer (section 2.2, DS-94, TON-298): Settings → Preferences offers Chrome's
// install prompt and says when Tonaris is installed or already running as an app, and a link an installed app's
// window is brought forward for opens there without reloading: Chromium only, as the install prompt and the launch
// queue are Chrome's and Edge's. Safari on a Mac is told to use Add to Dock (WebKit, in the browser matrix).

import { expect, test, type Page } from "./support/test";
import { live, violations } from "./support/workspace";

declare global {
  interface Window {
    /** Whether the test's install offer was opened. */
    installPrompted?: boolean;
    /** The consumer the app gave the test's launch queue. */
    launchConsumer?: (params: { targetURL?: string }) => void;
    /** Set before a launch, to tell a reload from a route change. */
    sameDocument?: boolean;
  }
}

const app = (page: Page) => page.getByRole("region", { name: "App" });

const chromeOnly = (browserName: string) =>
  test.skip(browserName !== "chromium", "Chrome's install prompt, display mode and launch queue");

test("Safari on a Mac is told to use Add to Dock", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "Safari's own directions");
  await page.goto("/settings/preferences");
  await live(page);
  await expect(app(page)).toContainText("In Safari, choose File → Add to Dock.");
});

test("Preferences opens Chrome's install prompt, then says Tonaris is installed", async ({
  page,
  browserName,
}) => {
  chromeOnly(browserName);
  await page.goto("/settings/preferences");
  await live(page);
  await expect(app(page)).toBeVisible();

  // Chrome offers to install, as it does once the page meets its install criteria.
  await page.evaluate(() => {
    const offer = Object.assign(new Event("beforeinstallprompt"), {
      prompt: async () => {
        window.installPrompted = true;
      },
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(offer);
  });
  await expect(app(page)).toContainText("Install Tonaris to open it in its own window");
  expect(await violations(page, "main")).toEqual([]);

  await app(page).getByRole("button", { name: "Install Tonaris" }).click();
  await expect(app(page)).toContainText("Tonaris is installed.");
  expect(await page.evaluate(() => window.installPrompted)).toBe(true);
  await expect(app(page).getByRole("button")).toHaveCount(0);
  await expect(app(page).getByRole("heading", { name: "App" })).toBeFocused();
});

test("an installed app's window says it runs installed", async ({ page, browserName }) => {
  chromeOnly(browserName);
  // An installed app's window matches `display-mode: standalone`, which DevTools can't emulate.
  await page.addInitScript(() => {
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) =>
      matchMedia(query === "(display-mode: standalone)" ? "all" : query);
  });
  await page.goto("/settings/preferences");
  await live(page);
  await expect(app(page)).toHaveText("AppYou're using Tonaris as an installed app.");
});

test("a link the app's window is brought forward for opens there, without reloading", async ({
  page,
  browserName,
}) => {
  chromeOnly(browserName);
  // Chrome's launch queue, as an installed app's window has it.
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", {
      configurable: true,
      value: {
        setConsumer(consumer: (params: { targetURL?: string }) => void) {
          window.launchConsumer = consumer;
        },
      },
    });
  });
  await page.goto("/c");
  await live(page);
  await page.evaluate(() => {
    window.sameDocument = true;
  });

  // The launch that opened the window stays where it is.
  await page.evaluate(() => window.launchConsumer?.({ targetURL: window.location.href }));
  await expect(page).toHaveURL("/c");

  await page.evaluate(() =>
    window.launchConsumer?.({ targetURL: `${window.location.origin}/unsorted` }),
  );
  await expect(page).toHaveURL("/unsorted");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Unsorted");
  expect(await page.evaluate(() => window.sameDocument)).toBe(true);
});
