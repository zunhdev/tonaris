// The save-state interface in a real browser (FR-09.3, FR-09.4, PRD section 2.3; DS-80 to DS-83): the
// SyncIndicator, Activity, the toasts, the conflict review, the offline banner and the announcements. Until the
// collection has rows (TON-33, TON-34), the tests make their edits through the page's sync client (`TEST_HOOKS`),
// as the rows will. Each test signs in with its own account.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { bootstrapSchema, uuidv7, type Container } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";

test.use({ storageState: { cookies: [], origins: [] } });

const webOrigin = "http://localhost:3100";

const list = (name: string): Container => ({ id: uuidv7(), kind: "list", parentId: null, name });

/** Waits until the page's sync client is connected. */
async function live(page: Page): Promise<void> {
  await page.waitForFunction(() => window.tonarisSync?.engine.status === "live");
}

/** The account's lists as the API has them. */
async function savedNames(page: Page): Promise<string[]> {
  const response = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
  return bootstrapSchema
    .parse(await response.json())
    .containers.map((each) => each.name)
    .toSorted();
}

/** Creates a list through the page's client, and waits until it is saved. */
async function created(page: Page, name: string): Promise<Container> {
  const value = list(name);
  await page.evaluate(async (container) => {
    await window.tonarisSync?.containers.insert(container).isPersisted.promise;
  }, value);
  return value;
}

/** Writes without waiting for the outcome, as the interface does. */
async function insert(page: Page, ...values: Container[]): Promise<void> {
  await page.evaluate((containers) => {
    window.tonarisSync?.containers.insert(containers).isPersisted.promise.catch(() => {});
  }, values);
}

async function rename(page: Page, id: string, name: string): Promise<void> {
  await page.evaluate(
    ([listId, to]) => {
      window.tonarisSync?.containers
        .update(listId, (draft) => {
          draft.name = to;
        })
        .isPersisted.promise.catch(() => {});
    },
    [id, name] as const,
  );
}

/** Renames a list from another session, through the API. */
async function renameElsewhere(page: Page, id: string, from: string, to: string): Promise<void> {
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: webOrigin },
    data: {
      mutationId: uuidv7(),
      name: "container.rename",
      args: { id, name: to },
      base: { name: from },
    },
  });
  expect(response.status()).toBe(200);
}

/**
 * Renames a list in the page while another session renames it first: the page's write is held on its way until
 * the other is saved, so it meets the newer name and comes back as a conflict.
 */
async function conflictingRename(page: Page, value: Container, mine: string, theirs: string) {
  const held = Promise.withResolvers<void>();
  await page.route(`${apiUrl}/v1/mutations`, async (route) => {
    await held.promise;
    await route.continue();
  });
  await rename(page, value.id, mine);
  await renameElsewhere(page, value.id, value.name, theirs);
  held.resolve();
  await page.unrouteAll({ behavior: "wait" });
}

const indicator = (page: Page) => page.getByRole("button", { name: /^Sync status:/ });
const activity = (page: Page) => page.getByRole("dialog", { name: "Activity" });
const toasts = (page: Page) => page.locator('[data-slot="toast"]');
const announcements = (page: Page) => page.locator('[data-slot="announcer"]');

/** Axe's findings in `selector`, once its opening animation is over: mid-fade, its text is still faint. */
async function violations(page: Page, selector: string) {
  await page
    .locator(selector)
    .evaluate((element) =>
      Promise.all(element.getAnimations({ subtree: true }).map((each) => each.finished)),
    );
  return (await new AxeBuilder({ page }).include(selector).analyze()).violations;
}

async function openActivity(page: Page) {
  await indicator(page).click();
  await expect(activity(page)).toBeVisible();
  return activity(page);
}

test("a slow save shows Saving…, is listed in Activity, and settles with no state and no message", async ({
  page,
}) => {
  await signIn(page, accounts.saveSlow);
  await live(page);
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");

  const answered = Promise.withResolvers<void>();
  await page.route(`${apiUrl}/v1/mutations`, async (route) => {
    await answered.promise;
    await route.continue();
  });
  await insert(page, list("Later"));
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Saving…");
  const panel = await openActivity(page);
  await expect(panel.getByRole("listitem")).toHaveText(["New list 'Later'Saving…"]);

  answered.resolve();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
  await expect(panel).toContainText("All changes are saved.");
  await expect(toasts(page)).toHaveCount(0);
  // Routine saves are not announced (DS-83).
  await expect(announcements(page)).toHaveText(["", ""]);
  await expect.poll(() => savedNames(page)).toEqual(["Later"]);
});

test("changes sent without an answer wait to confirm, never as saved, and are saved once answered", async ({
  page,
}) => {
  await signIn(page, accounts.saveUnanswered);
  await live(page);
  await page.route(`${apiUrl}/v1/batches`, (route) => route.abort("internetdisconnected"));

  // One action, two lists: one request, which goes unanswered.
  await insert(page, list("Later"), list("Soon"));
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 2 changes waiting to confirm");
  const panel = await openActivity(page);
  await expect(panel.getByRole("listitem")).toHaveText([
    "New list 'Later'Waiting to confirm",
    "New list 'Soon'Waiting to confirm",
  ]);
  expect(await savedNames(page)).toEqual([]);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.evaluate(() => window.tonarisSync?.outbox.wake());
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
  await expect(toasts(page)).toHaveCount(0);
  await expect.poll(() => savedNames(page)).toEqual(["Later", "Soon"]);
});

test("a failed save is reported until dealt with, also after a reload, and Retry saves it", async ({
  page,
}) => {
  await signIn(page, accounts.saveFailed);
  await live(page);
  const later = await created(page, "Later");

  await insert(page, list("Later"));
  const toast = toasts(page).filter({ hasText: "Couldn't save the list 'Later'" });
  await expect(toast).toContainText('There\'s already a list named "Later" at the top level.');
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn't save the list 'Later'" }),
  ).toBeAttached();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 1 needs review");

  // F6 reaches the toasts (DS-108). Closing one keeps the failure in Activity, across a reload too.
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "Close" }).click();
  await expect(toast).toBeHidden();
  await page.reload();
  await live(page);
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 1 needs review");
  await expect(toasts(page)).toHaveCount(0);
  const panel = await openActivity(page);
  const failed = panel.getByRole("listitem");
  await expect(failed).toHaveText(
    /^New list 'Later'Couldn't save: There's already a list named "Later" at the top level\./,
  );
  expect(await violations(page, '[data-slot="popover-content"]')).toEqual([]);

  // Once the other list has another name, Retry saves it.
  await page.keyboard.press("Escape");
  await rename(page, later.id, "Sooner");
  await expect.poll(() => savedNames(page)).toEqual(["Sooner"]);
  await indicator(page).click();
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
  await expect.poll(() => savedNames(page)).toEqual(["Later", "Sooner"]);

  // A failure can also just be dismissed.
  await insert(page, list("Later"));
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 1 needs review");
  await panel.getByRole("button", { name: "Dismiss" }).click();
  await expect(panel).toContainText("All changes are saved.");
  await expect(toasts(page)).toHaveCount(0);
});

test("a conflict is reviewed: Apply mine saves the attempt, Keep current the newer value, also after a reload", async ({
  page,
}) => {
  await signIn(page, accounts.saveConflict);
  await live(page);
  const later = await created(page, "Later");

  await conflictingRename(page, later, "Favorites", "Soon");
  const toast = toasts(page).filter({ hasText: "'Later' changed while you were editing" });
  await expect(toast).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "'Later' changed while you were editing" }),
  ).toBeAttached();
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "Review" }).click();
  const review = page.getByRole("alertdialog", { name: "'Later' changed while you were editing" });
  await expect(review.getByRole("row")).toHaveText(["FieldCurrentYours", "NameSoonFavorites"]);
  await expect(review.getByRole("button", { name: "Keep current" })).toBeFocused();
  expect(await violations(page, '[data-slot="alert-dialog-content"]')).toEqual([]);
  await review.getByRole("button", { name: "Apply mine" }).click();
  await expect(review).toBeHidden();
  await expect(toast).toBeHidden();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
  await expect.poll(() => savedNames(page)).toEqual(["Favorites"]);

  // A second conflict, reviewed after a reload: Keep current leaves the other session's name.
  await conflictingRename(page, { ...later, name: "Favorites" }, "Mine", "Theirs");
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 1 needs review");
  await page.reload();
  await live(page);
  const panel = await openActivity(page);
  await expect(panel.getByRole("listitem")).toHaveText([
    "Rename 'Favorites' to 'Mine'Changed elsewhereReview",
  ]);
  await panel.getByRole("button", { name: "Review" }).click();
  const again = page.getByRole("alertdialog", {
    name: "'Favorites' changed while you were editing",
  });
  await expect(again.getByRole("row")).toHaveText(["FieldCurrentYours", "NameTheirsMine"]);
  await again.getByRole("button", { name: "Keep current" }).click();
  await expect(again).toBeHidden();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
  await expect.poll(() => savedNames(page)).toEqual(["Theirs"]);
  expect(await page.evaluate(() => window.tonarisSync?.states.conflicts().length)).toBe(0);
});

test("going offline is reported and announced, with a banner, until the connection is back", async ({
  page,
  context,
}) => {
  await signIn(page, accounts.saveOffline);
  await live(page);
  const banner = page.getByText("Offline — showing what was last loaded");

  await context.setOffline(true);
  await expect(indicator(page)).toHaveAccessibleName(
    "Sync status: Offline — changes can't be saved",
  );
  await expect(banner).toBeVisible();
  await expect(announcements(page).nth(1)).toHaveText(
    "You're offline. Changes can't be saved until the connection is back.",
  );

  await context.setOffline(false);
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date", {
    timeout: 15_000,
  });
  await expect(banner).toBeHidden();
});
