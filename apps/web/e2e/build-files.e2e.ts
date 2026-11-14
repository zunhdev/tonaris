// A page whose build files fail to load, as when a deploy's other server answers for them, reloads itself once
// (TON-179). The server's side, a 404 that nothing caches, is in server.ts, which these tests don't run.

import { expect, test, type Page } from "./support/test";

/** Counts the page's documents: the first load and every reload. */
function countDocuments(page: Page) {
  const count = { documents: 0 };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) count.documents += 1;
  });
  return count;
}

test("a page whose build files fail to load reloads and comes up", async ({ page }) => {
  const count = countDocuments(page);
  await page.route("**/assets/**", (route) =>
    count.documents === 1 ? route.fulfill({ status: 404, body: "Not found" }) : route.fallback(),
  );

  await page.goto("/c", { waitUntil: "commit" });
  // The workspace renders only in the browser, so it shows only once its scripts run.
  await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
  expect(count.documents).toBe(2);
});

test("a build file that stays missing reloads the page only once", async ({ page }) => {
  const count = countDocuments(page);
  let failuresAfterReload = 0;
  await page.route("**/assets/**", (route) => {
    if (count.documents > 1) failuresAfterReload += 1;
    return route.fulfill({ status: 404, body: "Not found" });
  });

  await page.goto("/c", { waitUntil: "commit" });
  await expect.poll(() => failuresAfterReload).toBeGreaterThan(0);
  // A second reload would start as soon as the reloaded page heard of the failure.
  await page.waitForTimeout(1000);
  expect(count.documents).toBe(2);
});
