// Batch reports in a real browser (FR-13.4, FR-13.5, AC-34; DS-84, DS-107, DS-108): one action's writes, a batch,
// reported together in Activity, with one toast when it doesn't fully save. Independent successes are kept, what
// built on a failure is skipped, and retries make the rest again without duplicating anything. The edits go through
// the page's sync client (support/workspace.ts). Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { uuidv7, type Container } from "@tonaris/domain";

import { accounts } from "./support/accounts";
import { signIn } from "./support/sign-in";
import {
  activity,
  announcements,
  created,
  indicator,
  insert,
  keptReports,
  list,
  live,
  openActivity,
  rename,
  savedNames,
  toasts,
  violations,
} from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const report = (page: Page) => activity(page).locator('[data-slot="batch-report"]');

test("a batch that partly fails is reported once, by status, kept across a reload, and retried without duplicates", async ({
  page,
}) => {
  await signIn(page, accounts.batchPartial);
  await live(page);
  const later = await created(page, "Later");

  // One action: a folder whose name is taken, a list inside it, and two other lists.
  const folder: Container = { id: uuidv7(), kind: "folder", parentId: null, name: "Later" };
  const doom: Container = { id: uuidv7(), kind: "list", parentId: folder.id, name: "Doom" };
  await insert(page, folder, doom, list("Soon"), list("Sooner"));

  // One toast for the whole batch, announced as an alert, instead of one per item.
  const toast = toasts(page).filter({ hasText: "Couldn't save 2 of 4 changes" });
  await expect(toast).toContainText("2 saved · 1 failed · 1 skipped");
  await expect(toasts(page)).toHaveCount(1);
  await expect(
    page.getByRole("alert").filter({ hasText: "Couldn't save 2 of 4 changes" }),
  ).toBeAttached();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 2 need review");
  // The independent successes are kept.
  await expect.poll(() => savedNames(page)).toEqual(["Later", "Soon", "Sooner"]);

  // View report opens Activity at the report, its header focused.
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "View report" }).click();
  await expect(activity(page)).toBeVisible();
  const header = report(page).getByRole("button", { name: "2 saved · 1 failed · 1 skipped" });
  await expect(header).toBeFocused();
  await expect(report(page).getByRole("heading")).toHaveText([
    "Failed (1)",
    "Skipped (1)",
    "Completed (2)",
  ]);
  await expect(report(page).getByRole("list", { name: "Failed (1)" })).toHaveText(
    "New folder 'Later''Later' already exists at the top level. Choose another name.RetryEdit",
  );
  await expect(report(page).getByRole("list", { name: "Skipped (1)" })).toHaveText(
    "New list 'Doom'Waits for the folder 'Later', which couldn't be saved. Retry it to save this too.",
  );
  const completed = report(page).getByRole("button", { name: "Completed (2)" });
  await expect(completed).toHaveAttribute("aria-expanded", "false");
  await completed.click();
  await expect(report(page).getByRole("listitem").filter({ hasText: "Soon" })).toHaveText([
    "New list 'Soon'",
    "New list 'Sooner'",
  ]);
  expect(await violations(page, '[data-slot="popover-content"]')).toEqual([]);

  // The report is kept across a reload, without a toast.
  await expect.poll(() => keptReports(page)).toBe(1);
  await page.reload();
  await live(page);
  await expect(indicator(page)).toHaveAccessibleName("Sync status: 2 need review");
  await expect(toasts(page)).toHaveCount(0);
  await openActivity(page);
  await expect(report(page).getByRole("heading")).toHaveText([
    "Failed (1)",
    "Skipped (1)",
    "Completed (2)",
  ]);

  // Once the name is free, Retry on the folder saves it and the list inside it, in the same report.
  await page.keyboard.press("Escape");
  await rename(page, later.id, "Earlier");
  await expect.poll(() => savedNames(page)).toEqual(["Earlier", "Soon", "Sooner"]);
  await openActivity(page);
  await report(page).getByRole("button", { name: "Retry" }).click();
  await expect(report(page).getByRole("button", { name: "4 saved" })).toBeVisible();
  await expect(indicator(page)).toHaveAccessibleName("Sync status: Up to date");
  await expect(announcements(page)).toHaveText(["4 changes saved.", ""]);
  // Nothing saved the first time was made again.
  await expect.poll(() => savedNames(page)).toEqual(["Doom", "Earlier", "Later", "Soon", "Sooner"]);
  const saved = await page.evaluate(
    (id) => window.tonarisSync?.containers.get(id)?.parentId,
    doom.id,
  );
  expect(saved).toBe(folder.id);

  // Dismissed, it is gone, also after a reload: the browser deletes its copy (a reload aborts what is in flight).
  await report(page).getByRole("button", { name: "Dismiss" }).click();
  await expect(activity(page)).toContainText("All changes are saved.");
  await expect.poll(() => keptReports(page)).toBe(0);
  await page.reload();
  await live(page);
  await openActivity(page);
  await expect(activity(page)).toContainText("All changes are saved.");
});

test("Retry all makes every failure again at once", async ({ page }) => {
  await signIn(page, accounts.batchRetryAll);
  await live(page);
  const a = await created(page, "A");
  const b = await created(page, "B");

  await insert(page, list("A"), list("B"), list("C"));
  const toast = toasts(page).filter({ hasText: "Couldn't save 2 of 3 changes" });
  await expect(toast).toContainText("1 saved · 2 failed");
  await expect.poll(() => savedNames(page)).toEqual(["A", "B", "C"]);

  await rename(page, a.id, "A1");
  await rename(page, b.id, "B1");
  await expect.poll(() => savedNames(page)).toEqual(["A1", "B1", "C"]);
  await page.keyboard.press("F6");
  await toast.getByRole("button", { name: "View report" }).click();
  await report(page).getByRole("button", { name: "Retry all" }).click();
  await expect(report(page).getByRole("button", { name: "3 saved" })).toBeVisible();
  // Nothing left unsaved, so the toast closes.
  await expect(toasts(page)).toHaveCount(0);
  await expect.poll(() => savedNames(page)).toEqual(["A", "A1", "B", "B1", "C"]);
});
