// MCP approvals (FR-10.6, DS-87, TS-64): an agent's gated `delete_albums` waits for the owner, who approves on
// the approval page (here on a phone-sized screen, X-04), and only then does the agent's next call run. Another
// account can't see the request.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { z } from "zod";

import { uuidv7 } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signInEmail } from "./support/mailpit";
import {
  authorizeUrl,
  callTool,
  catchCallback,
  exchange,
  pkce,
  registerClient,
} from "./support/mcp";
import { requestCode, signIn } from "./support/sign-in";

test.use({ storageState: { cookies: [], origins: [] } });

/** Creates an album through the sync API, as the web app would (TS-20). Returns its ID. */
async function createAlbum(page: Page, title: string): Promise<string> {
  const id = uuidv7();
  const response = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: new URL(page.url()).origin },
    data: {
      mutationId: uuidv7(),
      name: "album.create",
      args: {
        id,
        title,
        artistCredit: "Miles Davis",
        releaseType: "album",
        isLive: false,
        originalYear: 1959,
        recordingYearStart: null,
        recordingYearEnd: null,
      },
    },
  });
  expect(response.status()).toBe(200);
  return id;
}

const needsApproval = z.object({
  status: z.literal("needs_approval"),
  approvalId: z.string(),
  url: z.string(),
});

test("the owner approves on a phone, and the agent's next call deletes the album", async ({
  page,
  browser,
  playwright,
}) => {
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  const { verifier, challenge } = await pkce();
  const received = await catchCallback(page);

  await page.goto("/sign-in");
  await requestCode(page, accounts.approver, "");
  await page.getByLabel("Code", { exact: true }).fill((await signInEmail(accounts.approver)).code);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(
    authorizeUrl(clientId, challenge, "collection:read collection:manage offline_access"),
  );
  await page.getByRole("radio", { name: /Manage collection/ }).check();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected")).toBeVisible();
  const { token } = await exchange(client, {
    clientId,
    code: received()?.get("code") ?? "",
    verifier,
  });

  await page.goto("/c");
  const album = await createAlbum(page, "Kind of Blue");
  const asked = needsApproval.parse(
    await callTool(client, token, "delete_albums", { albumIds: [album] }),
  );
  expect(asked.url).toBe(`http://localhost:3100/approvals/${asked.approvalId}`);

  // The owner opens the link on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(asked.url);
  await expect(
    page.getByRole("heading", { name: "Approve request from E2E Client" }),
  ).toBeVisible();
  await expect(page.getByText("Move 1 album to Trash")).toBeVisible();
  await expect(page.getByText("They can be recovered from Trash for 30 days.")).toBeVisible();
  await expect(page.getByText(/^Expires in (29|30):\d\d$/)).toBeVisible();
  await page.getByText("1 album", { exact: true }).click();
  await expect(page.getByText("Kind of Blue · Miles Davis")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Before the owner decides, the agent's retry still waits.
  const early = await callTool(client, token, "delete_albums", {
    albumIds: [album],
    approvalId: asked.approvalId,
  });
  expect(early).toMatchObject({ status: "needs_approval", note: "The owner hasn't decided yet." });

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved — return to E2E Client to continue.")).toBeVisible();

  const done = await callTool(client, token, "delete_albums", {
    albumIds: [album],
    approvalId: asked.approvalId,
  });
  expect(done).toEqual({ status: "confirmed", trashed: [album], unavailable: [] });
  await page.reload();
  await expect(page.getByText("Approved, and E2E Client has done it.")).toBeVisible();

  // Someone else signed in elsewhere can't see it.
  const strangers = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const stranger = await strangers.newPage();
  await signIn(stranger, accounts.stranger);
  await stranger.goto(asked.url);
  await expect(stranger.getByText("This request belongs to another account.")).toBeVisible();
  await strangers.close();
  await client.dispose();
});

test("declining tells the agent, and nothing is deleted", async ({ page, playwright }) => {
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  const { verifier, challenge } = await pkce();
  const received = await catchCallback(page);
  await page.goto("/sign-in");
  await requestCode(page, accounts.stranger, "");
  await page.getByLabel("Code", { exact: true }).fill((await signInEmail(accounts.stranger)).code);
  await expect(page).not.toHaveURL(/\/sign-in/);
  await page.goto(
    authorizeUrl(clientId, challenge, "collection:read collection:manage offline_access"),
  );
  await page.getByRole("radio", { name: /Manage collection/ }).check();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected")).toBeVisible();
  const { token } = await exchange(client, {
    clientId,
    code: received()?.get("code") ?? "",
    verifier,
  });

  await page.goto("/c");
  const album = await createAlbum(page, "Sketches of Spain");
  const asked = needsApproval.parse(
    await callTool(client, token, "delete_albums", { albumIds: [album] }),
  );
  await page.goto(asked.url);
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Declined. Nothing will change.")).toBeVisible();
  expect(
    await callTool(client, token, "delete_albums", {
      albumIds: [album],
      approvalId: asked.approvalId,
    }),
  ).toEqual({ status: "declined" });
  await client.dispose();
});
