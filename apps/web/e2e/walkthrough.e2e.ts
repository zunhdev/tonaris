// Keyboard-only walkthroughs (DS-115, TS-122, AC-42; TON-93): signing in, the workspace's pages and dialogs, guest
// pages and the pages a failure leads to, by keyboard alone. At every Tab stop, a screen reader has a name to announce
// and the focus ring shows; focus never goes round a page; dialogs keep focus inside and give it back on Escape; and
// axe finds nothing. The screen-reader passes on real devices follow docs/accessibility-walkthrough.md.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7 } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { faults, tabThrough, tabTo, tabWithin } from "./support/keyboard";
import { clearInbox, signInEmail } from "./support/mailpit";
import { signIn } from "./support/sign-in";
import {
  added,
  album,
  insert,
  list,
  live,
  saved,
  violations,
  webOrigin,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });
// Walking a dozen pages stop by stop takes longer than a test's 30 s under the full suite's load.
test.describe.configure({ timeout: 90_000 });

/**
 * Nothing for axe on the page as it opened, then every stop named and ringed, and focus leaving the page at the end.
 * axe goes first: the sweep leaves a tooltip fading out.
 */
async function walk(page: Page, where: string, max?: number) {
  const found = await violations(page, "body");
  expect(
    found.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.html).join(" | ")}`),
    where,
  ).toEqual([]);
  expect(faults(await tabThrough(page, max)), where).toEqual([]);
}

test("signing in by keyboard alone", async ({ page }) => {
  await clearInbox(accounts.arrival);
  await page.goto("/sign-in");
  await walk(page, "sign-in");
  const email = page.getByLabel("Email");
  await tabTo(page, email);
  await page.keyboard.type(accounts.arrival);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: `Check ${accounts.arrival}` })).toBeVisible();
  await walk(page, "the code screen");

  const { code } = await signInEmail(accounts.arrival);
  await tabTo(page, page.getByLabel("Code", { exact: true }));
  await page.keyboard.type(code);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await live(page);
});

test("the workspace by keyboard: pages, the palette and dialogs", async ({ page }) => {
  await signIn(page, accounts.walker);
  await live(page);
  const jazz = list("Jazz");
  await insert(page, jazz);
  await saved(page);
  await added(page, [album("Kind of Blue", { originalYear: 1959 })], jazz.id);

  for (const path of [
    "/c",
    `/l/${jazz.id}`,
    "/unsorted",
    "/trash",
    "/shared",
    "/invitations",
    "/settings/profile",
    "/settings/account",
    "/settings/preferences",
    "/settings/custom-fields",
    "/settings/connections",
    "/settings/data",
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await page.goto(path);
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await live(page);
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await walk(page, path);
  }

  // The palette, opened by its shortcut, keeps focus while open and gives it back on Escape.
  await page.goto(`/l/${jazz.id}`);
  await live(page);
  const viewButton = page.getByRole("button", { name: "View", exact: true });
  await tabTo(page, viewButton);
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Search" });
  await expect(palette).toBeVisible();
  const inPalette = await tabWithin(page, palette);
  expect(inPalette.ends).toBe("round");
  expect(faults(inPalette.stops)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(viewButton).toBeFocused();

  // View options, a popover: Escape gives focus back, and Tab goes through it and on to the page.
  await page.keyboard.press("Enter");
  const options = page.getByRole("dialog", { name: "View options" });
  await expect(options).toBeVisible();
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(viewButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(options).toBeVisible();
  const inOptions = await tabWithin(page, options);
  expect(inOptions.stops.length).toBeGreaterThan(0);
  expect(faults(inOptions.stops)).toEqual([]);

  // Sharing, a modal dialog: focus stays inside, and Escape gives it back.
  const share = page.getByRole("button", { name: "Share" });
  await tabTo(page, share);
  await page.keyboard.press("Enter");
  const sharing = page.getByRole("dialog", { name: `Share "Jazz" · list` });
  await expect(sharing).toBeVisible();
  const inSharing = await tabWithin(page, sharing);
  expect(inSharing.ends).toBe("round");
  expect(faults(inSharing.stops)).toEqual([]);
  expect(await violations(page, '[role="dialog"]')).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sharing).toBeHidden();
  await expect(share).toBeFocused();
});

test("guest pages and the pages a failure leads to, by keyboard", async ({ page, browser }) => {
  await signIn(page, accounts.guide);
  await live(page);
  const shared = list("Shared by keyboard");
  await insert(page, shared);
  await saved(page);
  await added(page, [album("A Love Supreme", { originalYear: 1965 })], shared.id);
  // Sharing needs a display name (FR-07.1).
  for (const [name, args] of [
    ["account.setDisplayName", { displayName: "Walker" }],
    ["share.setLink", { containerId: shared.id, linkId: uuidv7(), enabled: true }],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- the name first
    const sent = await page.request.post(`${apiUrl}/v1/mutations`, {
      headers: { origin: webOrigin },
      data: { mutationId: uuidv7(), name, args },
    });
    // oxlint-disable-next-line no-await-in-loop -- the name first
    expect((await sent.json()).outcome, name).toMatchObject({ status: "confirmed" });
  }
  const sharing = await (
    await page.request.get(`${apiUrl}/v1/containers/${shared.id}/sharing`)
  ).json();
  const link = new URL(sharing.link.url).pathname;

  const guest = await (
    await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ).newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Shared by keyboard" })).toBeVisible();
  await walk(guest, "the guest page");

  const unknownToken = "A".repeat(43);
  for (const [path, says] of [
    [`/s/${unknownToken}`, /not available/i],
    [`/join/${unknownToken}`, /invitation/i],
    [`/recover/${unknownToken}`, /Confirm your new sign-in email/],
    ["/no-such-page", /Page not found/],
    ["/help/recovery", /./],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await guest.goto(path);
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await expect(guest.locator("main, body").first()).toContainText(says);
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await walk(guest, path);
  }
  await guest.context().close();
});

test("Admin's pages by keyboard", async ({ browser }) => {
  // The creator's own session, which the other projects' tests share.
  const context = await browser.newContext({ storageState: "playwright/.auth/creator.json" });
  const page = await context.newPage();
  for (const path of ["/admin/admissions", "/admin/members", "/admin/operations"]) {
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await page.goto(path);
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await live(page);
    // Members lists every e2e account.
    // oxlint-disable-next-line no-await-in-loop -- one page after another
    await walk(page, path, 400);
  }
  await context.close();
});
