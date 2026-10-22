// The save-state interface in a real browser (FR-09.3, FR-09.4, PRD section 2.3; DS-80 to DS-83): the
// SyncIndicator, Activity, the toasts, the conflict review, the offline banner and the announcements. The edits go
// through the page's sync client (support/workspace.ts). Each test signs in with its own account. Batch reports are
// batch-report.e2e.ts.

import { expect, test } from "@playwright/test";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  announcements,
  conflictingRename,
  created,
  indicator,
  insert,
  list,
  live,
  openActivity,
  rename,
  savedNames,
  toasts,
  violations,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

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

  // One action, two lists: one request, which goes unanswered. They are one batch, reported together (DS-84).
  await insert(page, list("Later"), list("Soon"));
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 2 changes waiting to confirm");
  const panel = await openActivity(page);
  const report = panel.locator('[data-slot="batch-report"]');
  await expect(report).toHaveCount(1);
  await expect(report.getByRole("button", { name: "2 waiting to confirm" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(
    report.getByRole("list", { name: "Waiting to confirm (2)" }).getByRole("listitem"),
  ).toHaveText(["New list 'Later'", "New list 'Soon'"]);
  expect(await savedNames(page)).toEqual([]);

  // Once answered and wholly saved, the report closes by itself, and only a polite summary is said.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.evaluate(() => window.tonarisSync?.outbox.wake());
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
  await expect(panel).toContainText("All changes are saved.");
  await expect(announcements(page)).toHaveText(["2 changes saved.", ""]);
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
  await expect(toast).toContainText(
    "'Later' already exists at the top level. Choose another name.",
  );
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
    /^New list 'Later'Couldn't save: 'Later' already exists at the top level\. Choose another name\./,
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
