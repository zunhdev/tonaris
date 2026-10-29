// MCP approvals (FR-10.6, DS-86, DS-87, TS-64): an agent's gated `delete_items` waits for the owner, who finds it in
// the sidebar and Settings → Connections and approves on the approval page (here on a phone-sized screen, X-04), and
// only then does the agent's next call run. Another account can't see the request.

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
import { live } from "./support/workspace";

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
        artworkUrl: null,
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
  // Signed in and the workspace loaded: a load still under way would interrupt the next one (WebKit, TON-94).
  await live(page);
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
    await callTool(client, token, "delete_items", { albumIds: [album] }),
  );
  expect(asked.url).toBe(`http://localhost:3100/approvals/${asked.approvalId}`);

  // The app shows it waiting: in the sidebar, and in Settings → Connections with a link to its page.
  await page.goto("/settings/connections");
  await expect(page.getByRole("heading", { name: "Waiting for your approval (1)" })).toBeVisible();
  await expect(page.getByText("Move 1 album to Trash")).toBeVisible();
  await expect(
    page.getByRole("tree").getByRole("treeitem", { name: "Approvals 1 request to approve" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Review" })).toHaveAttribute(
    "href",
    `/approvals/${asked.approvalId}`,
  );

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
  const early = await callTool(client, token, "delete_items", {
    albumIds: [album],
    approvalId: asked.approvalId,
  });
  expect(early).toMatchObject({ status: "needs_approval", note: "The owner hasn't decided yet." });

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Approved — return to E2E Client to continue.")).toBeVisible();

  const done = await callTool(client, token, "delete_items", {
    albumIds: [album],
    approvalId: asked.approvalId,
  });
  expect(done).toMatchObject({
    status: "ran",
    items: [{ albumId: album, outcome: { status: "confirmed" } }],
  });
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

test("declining a list's deletion tells the agent, and nothing is deleted", async ({
  page,
  playwright,
}) => {
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  const { verifier, challenge } = await pkce();
  const received = await catchCallback(page);
  await page.goto("/sign-in");
  await requestCode(page, accounts.stranger, "");
  await page.getByLabel("Code", { exact: true }).fill((await signInEmail(accounts.stranger)).code);
  // Signed in and the workspace loaded: a load still under way would interrupt the next one (WebKit, TON-94).
  await live(page);
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
  const list = uuidv7();
  const created = await page.request.post(`${apiUrl}/v1/mutations`, {
    headers: { origin: new URL(page.url()).origin },
    data: {
      mutationId: uuidv7(),
      name: "container.create",
      args: { id: list, kind: "list", parentId: null, name: "Late Miles" },
    },
  });
  expect(created.status()).toBe(200);
  const asked = needsApproval.parse(
    await callTool(client, token, "delete_items", { containerIds: [list] }),
  );
  await page.goto(asked.url);
  await expect(page.getByText("Move 1 list to Trash")).toBeVisible();
  await page.getByText("1 list", { exact: true }).click();
  await expect(page.getByText("Late Miles")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText("Declined. Nothing will change.")).toBeVisible();
  expect(
    await callTool(client, token, "delete_items", {
      containerIds: [list],
      approvalId: asked.approvalId,
    }),
  ).toEqual({ status: "declined" });
  await client.dispose();
});
