// feedback-board spec (FR-11.15, TON-144): the account menu opens the feedback board in a new tab, through Fider's
// sign-in route for Tonaris's provider, so a member arrives signed in. The board is Fider's, so the test stands one in
// at its address; the API's side of the sign-in is apps/api/src/auth/feedback.test.ts.

import { expect, test } from "@playwright/test";

import { feedbackBoard } from "./support/accounts";

test("the account menu opens the feedback board, signing in through Tonaris", async ({
  page,
  context,
}) => {
  await context.route(`${feedbackBoard.url}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Feedback board</title>" }),
  );
  await page.goto("/c");
  await page.getByRole("button", { name: /^Account:/ }).click();
  const opened = context.waitForEvent("page");
  await page.getByRole("menuitem", { name: "Feedback and ideas" }).click();
  const board = await opened;
  await expect(board).toHaveURL(
    `${feedbackBoard.url}/oauth/${feedbackBoard.provider}?redirect=${encodeURIComponent(`${feedbackBoard.url}/`)}`,
  );
  // The workspace stays where it was.
  await expect(page).toHaveURL(/\/c$/);
});
