// Admin → Operations in a real browser (TS-115; TON-91): the creator sees that no backup is recorded yet and that
// no job gave up, and can send a test error, which, without a Sentry key here, the API only logs.

import { expect, test } from "@playwright/test";

import { violations } from "./support/workspace";

test("the creator sees the backups and failed jobs, and can send a test error", async ({
  page,
}) => {
  await page.goto("/admin/operations");
  await expect(page.getByRole("heading", { level: 1, name: "Operations" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Operations" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("No backup is recorded yet.", { exact: false })).toBeVisible();
  await expect(page.getByText("None. Every job finished or is still being retried.")).toBeVisible();

  await page.getByRole("button", { name: "Send a test error" }).click();
  await expect(page.getByText(/^Sent from the API, which logged it\./)).toBeVisible();
  expect(await violations(page, "main")).toEqual([]);
});
