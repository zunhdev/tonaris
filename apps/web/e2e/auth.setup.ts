// Signs the creator in through the pages and saves the browser state the workspace tests start from.

import { accounts, creatorState } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { expect, test as setup } from "./support/test";

setup("sign the creator in", async ({ page }) => {
  await signIn(page, accounts.creator);
  await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
  await page.context().storageState({ path: creatorState });
});
