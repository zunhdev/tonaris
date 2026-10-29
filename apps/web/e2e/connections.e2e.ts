// accounts spec, MCP connections (FR-10.3, DS-85, DS-86, TS-61): an AI client's authorization request, from a
// signed-out browser through sign-in and consent back to the client, then the connection in Settings and its
// revocation, with when the client last called. The client is registered by DCR and its callback is caught in the
// browser.

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { accounts } from "./support/accounts";
import { signInEmail } from "./support/mailpit";
import {
  authorizeUrl,
  catchCallback,
  exchange,
  mcpRequest,
  pkce,
  registerClient,
} from "./support/mcp";
import { requestCode } from "./support/sign-in";

test.use({ storageState: { cookies: [], origins: [] } });

const bothModes = "collection:read collection:manage offline_access";
const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list" };

test("a client connects through sign-in and consent, and Settings revokes it", async ({
  page,
  playwright,
}) => {
  // The client's own HTTP calls: from its servers, without the browser's cookies.
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  const { verifier, challenge } = await pkce();
  const received = await catchCallback(page);

  await page.goto(authorizeUrl(clientId, challenge, bothModes));
  await expect(page).toHaveURL(/\/sign-in\?redirect=%2Foauth%2Fauthorize%3F/);

  await requestCode(page, accounts.mcp, "");
  const { code: emailed } = await signInEmail(accounts.mcp);
  await page.getByLabel("Code", { exact: true }).fill(emailed);

  await expect(
    page.getByRole("heading", { name: "E2E Client wants access to your Tonaris collection" }),
  ).toBeVisible();
  await expect(
    page.getByText("Name as provided by the client. Returns to 127.0.0.1:3199."),
  ).toBeVisible();
  await expect(page.getByText(`Signed in as ${accounts.mcp}`)).toBeVisible();
  await expect(page.getByRole("radio", { name: /Read-only/ })).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("radio", { name: /Manage collection/ }).check();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected")).toBeVisible();
  const code = received()?.get("code") ?? "";
  expect(code).toBeTruthy();

  const { token } = await exchange(client, { clientId, code, verifier });
  expect((await mcpRequest(client, token, listTools)).status()).toBe(200);

  await page.goto("/settings/connections");
  const connection = page.getByRole("listitem").filter({ hasText: "E2E Client" });
  await expect(connection).toContainText("Manage collection");
  await expect(connection).toContainText("Last used");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await connection.getByRole("button", { name: "Revoke E2E Client" }).click();
  await expect(page.getByText("No AI client is connected.")).toBeVisible();
  expect((await mcpRequest(client, token, listTools)).status()).toBe(401);
  await client.dispose();
});

test("connecting without changing the mode grants Read-only", async ({ page, playwright }) => {
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  const { verifier, challenge } = await pkce();
  const received = await catchCallback(page);
  await page.goto("/sign-in");
  await requestCode(page, accounts.mcpDefault, "");
  await page
    .getByLabel("Code", { exact: true })
    .fill((await signInEmail(accounts.mcpDefault)).code);
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto(authorizeUrl(clientId, challenge, bothModes));
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected")).toBeVisible();

  const { scope } = await exchange(client, {
    clientId,
    code: received()?.get("code") ?? "",
    verifier,
  });
  expect(scope.split(" ").toSorted()).toEqual(["collection:read", "offline_access"]);
  await client.dispose();
});

test("cancelling consent sends the client access_denied", async ({ page, playwright }) => {
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  await client.dispose();
  const { challenge } = await pkce();
  const received = await catchCallback(page, "Cancelled");
  await page.goto("/sign-in");
  await requestCode(page, accounts.mcpCancel, "");
  await page.getByLabel("Code", { exact: true }).fill((await signInEmail(accounts.mcpCancel)).code);
  await expect(page).not.toHaveURL(/\/sign-in/);

  await page.goto(authorizeUrl(clientId, challenge, "collection:read offline_access"));
  // The client asked for reading only, so Manage collection isn't offered.
  await expect(page.getByRole("radio")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Cancelled")).toBeVisible();
  expect(received()?.get("error")).toBe("access_denied");
});
