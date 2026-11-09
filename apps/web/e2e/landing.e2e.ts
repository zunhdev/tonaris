// The landing page (TON-155, DS-120): where a signed-out visit to `/` arrives, rendered on the server, also after a
// stale session cookie; Sign in leads to the card, whose wordmark leads back; nothing for axe at desktop and phone
// widths. A signed-in visitor is offered Open Tonaris instead, and the sign-in page sends them on (TON-185). A
// signed-in `/` still opens the collection: app-shell.e2e.ts and collection-navigation.e2e.ts.

import { expect, type Page, test } from "@playwright/test";

import { creatorState } from "./support/accounts";
import { violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const title = "Your albums, organized your way";
const sections = [
  "Paste a link. Tonaris does the typing.",
  "Made for collections that outgrew the Library tab",
  "Your collection, in your pocket",
];

test("a signed-out visit to the root arrives at the landing page, rendered on the server", async ({
  page,
  request,
}) => {
  const root = await request.get("/", { maxRedirects: 0 });
  expect(root.status()).toBe(302);
  expect(root.headers().location).toBe("/welcome");

  const html = await (await request.get("/welcome")).text();
  expect(html).toMatch(new RegExp(`<h1[^>]*>${title}</h1>`));
  for (const section of sections) expect(html).toContain(section);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // The sections' headings, in order, among the page's others.
  await expect(page.getByRole("heading", { level: 2 })).toContainText(sections);
  // The workspace's picture is one image with a description.
  await expect(page.getByRole("img", { name: /^The Tonaris workspace/ })).toBeVisible();
  expect(await violations(page, "body")).toEqual([]);
});

test("on a phone the landing page fits the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await violations(page, "body")).toEqual([]);
});

test("a stale session cookie passes the server, and the browser sends the root on", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "__Secure-tonaris.session_token",
      value: "stale.token",
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

test("Sign in opens the sign-in card, whose wordmark leads back", async ({ page }) => {
  await page.goto("/welcome");
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  // The card stands alone: what Tonaris is, beside it since TON-116, is the landing page's now.
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);

  await page.getByRole("link", { name: "Tonaris, what it is" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});

/** In the workspace, past the landing and sign-in pages. */
async function inTheApp(page: Page) {
  await expect(page.getByRole("navigation", { name: "Sidebar" })).toBeVisible();
  expect(new URL(page.url()).pathname).not.toMatch(/^\/(welcome|sign-in)/);
}

test.describe("signed in", () => {
  test.use({ storageState: creatorState });

  test("the landing page offers Open Tonaris, from the same page the server renders for everyone", async ({
    page,
  }) => {
    // The server's page is everyone's: Sign in, whoever asks.
    const html = await (await page.request.get("/welcome")).text();
    expect(html).toContain(">Sign in</a>");
    expect(html).not.toContain("Open Tonaris");

    await page.goto("/welcome");
    // The header's, the hero's and the close's.
    await expect(page.getByRole("link", { name: "Open Tonaris" })).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await expect(
      page.getByText("You're signed in, so your collection is one click away."),
    ).toBeVisible();
    expect(await violations(page, "body")).toEqual([]);

    await page.getByRole("main").getByRole("link", { name: "Open Tonaris" }).first().click();
    await inTheApp(page);
  });

  test("the sign-in page sends them on, to the page asked for or their last view", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await inTheApp(page);

    await page.goto("/sign-in?redirect=%2Funsorted");
    await expect(page).toHaveURL(/\/unsorted$/);
    await expect(page.getByRole("heading", { level: 1, name: "Unsorted" })).toBeVisible();

    // An AI client's sign-in stays, since its client may have asked for a fresh one.
    await page.goto("/sign-in?redirect=%2Foauth%2Fauthorize%3Fclient_id%3Dx%26prompt%3Dlogin");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/sign-in\?redirect=/);
  });
});
