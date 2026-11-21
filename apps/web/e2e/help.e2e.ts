// Help (FR-16, DS-122, TON-307): public pages rendered on the server with their content; the contents in a sidebar
// on a computer and in a sheet on a phone; keys as the computer names them; Help by keyboard alone; an address
// that isn't a page answered with Not found; and nothing for axe at desktop and phone widths.

import { readdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "./support/test";
import { applePlatform, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const contentDir = path.join(import.meta.dirname, "../src/help/content");

/** Every page's address, from the pages themselves. */
async function slugs(): Promise<string[]> {
  const found: string[] = [];
  for (const section of await readdir(contentDir)) {
    // oxlint-disable-next-line no-await-in-loop
    for (const file of await readdir(path.join(contentDir, section))) {
      if (file.endsWith(".mdx")) found.push(`${section}/${file.slice(0, -4)}`);
    }
  }
  return found;
}

test("every page arrives rendered, with its title and its content", async ({ request }) => {
  const home = await (await request.get("/help")).text();
  expect(home).toMatch(/<h1[^>]*>Tonaris Help<\/h1>/);
  for (const slug of await slugs()) {
    // oxlint-disable-next-line no-await-in-loop
    const response = await request.get(`/help/${slug}`);
    expect(response.status(), slug).toBe(200);
    // oxlint-disable-next-line no-await-in-loop
    const html = await response.text();
    expect(html, slug).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    // The content itself, not only the frame: the page's paragraphs carry no class, the frame's do.
    expect(html, slug).toMatch(/<p>[^<]/);
  }
});

test("the home leads to a page, whose contents, On this page and Next work", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/help");
  await expect(page.getByRole("heading", { level: 1, name: "Tonaris Help" })).toBeVisible();
  expect(await violations(page, "body")).toEqual([]);

  await page
    .getByRole("link", { name: /^Your first ten minutes/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/help\/start-here\/your-first-ten-minutes$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Your first ten minutes" }),
  ).toBeVisible();
  await expect(page.getByText("Needs a computer")).toBeVisible();
  const contents = page.getByRole("navigation", { name: "Help" });
  await expect(contents.getByRole("link", { name: "Your first ten minutes" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const onThisPage = page.getByRole("navigation", { name: "On this page" });
  await onThisPage.getByRole("link", { name: "4. Play it" }).click();
  await expect(page).toHaveURL(/#4-play-it$/);
  await expect(page.getByRole("img", { name: /Open in menu/ })).toBeVisible();
  expect(await violations(page, "body")).toEqual([]);

  await page
    .getByRole("navigation", { name: "Previous and next" })
    .getByRole("link", { name: /Next/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Joining and signing in" }),
  ).toBeVisible();
});

test("keys show as the computer names them, and are read by name", async ({ page }) => {
  await page.goto("/help/start-here/your-first-ten-minutes");
  const apple = await applePlatform(page);
  await expect(
    page.locator("kbd").filter({ hasText: apple ? "Command V" : "Control V" }),
  ).toHaveCount(1);
  await expect(
    page
      .locator("kbd kbd")
      .filter({ hasText: apple ? "⌘" : "Ctrl" })
      .first(),
  ).toBeVisible();
});

test("Help works by keyboard alone: the skip link, and the contents by arrows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/help/start-here/what-tonaris-is");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#help-content")).toBeFocused();

  const contents = page.getByRole("navigation", { name: "Help" });
  const section = contents.getByRole("button", { name: "Start here" });
  await section.focus();
  await expect(section).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(section).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await expect(section).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(contents.getByRole("link", { name: "What Tonaris is" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(contents.getByRole("link", { name: "Your first ten minutes" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(section).toBeFocused();
  await page.keyboard.press("Home");
  await expect(contents.getByRole("link", { name: "Help home" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(contents.locator("[data-help-row]").last()).toBeFocused();
  await contents.getByRole("link", { name: "Joining and signing in" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Joining and signing in" }),
  ).toBeVisible();
});

test("on a phone the contents open in a sheet, and the page fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/help/start-here/what-tonaris-is");
  await expect(page.getByRole("heading", { level: 1, name: "What Tonaris is" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await violations(page, "body")).toEqual([]);

  await page.getByRole("button", { name: "Contents" }).click();
  const sheet = page.getByRole("dialog", { name: "Contents" });
  await sheet.getByRole("link", { name: "Joining and signing in" }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Joining and signing in" }),
  ).toBeVisible();
});

test("an address that isn't a page is Not found, with a way back", async ({ page, request }) => {
  expect((await request.get("/help/start-here/no-such-page")).status()).toBe(404);
  await page.goto("/help/start-here/no-such-page");
  await expect(
    page.getByRole("heading", { level: 1, name: "This page isn't in Help" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to Help's home" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tonaris Help" })).toBeVisible();
});

test("the keyboard shortcuts page lists every key, for a Mac or for Windows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/help/reference/keyboard-shortcuts");
  const keysFor = page.getByRole("group", { name: "Keys for" });
  await expect(keysFor).toBeVisible();
  const groups = ["Moving around", "Views", "Albums", "Folders and lists", "Trash", "Help"];
  await Promise.all(
    groups.map((group) => expect(page.getByRole("region", { name: group })).toBeVisible()),
  );
  const search = page
    .getByRole("region", { name: "Moving around" })
    .locator("div")
    .filter({ hasText: /^Search/ });
  // The arrows switch, as in any radio group, and the keys follow.
  const choose = (name: string) => keysFor.locator("label").filter({ hasText: name }).click();
  await choose("Mac");
  await expect(keysFor.getByRole("radio", { name: "Mac" })).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect(keysFor.getByRole("radio", { name: "Windows and Linux" })).toBeChecked();
  await expect(search.locator("kbd").first()).toHaveText("Ctrl");
  await expect(search).toContainText("Control K");
  await choose("Mac");
  await expect(search.locator("kbd").first()).toHaveText("⌘");
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  expect(await violations(page, "body")).toEqual([]);
});
