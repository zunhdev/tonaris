// accounts spec, MCP connections (FR-10.3, DS-85, DS-86, TS-61): an AI client's authorization request, from a
// signed-out browser through sign-in and consent back to the client, then the connection in Settings and its
// revocation. The client is registered by DCR and its callback is caught in the browser.

import { AxeBuilder } from "@axe-core/playwright";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { z } from "zod";

import { accounts, apiUrl } from "./support/accounts";
import { signInEmail } from "./support/mailpit";
import { requestCode } from "./support/sign-in";

test.use({ storageState: { cookies: [], origins: [] } });

const callback = "http://127.0.0.1:3199/callback";

async function pkce() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

/** Registers a client by DCR, as an MCP client without a metadata document would. */
async function registerClient(client: APIRequestContext): Promise<string> {
  const response = await client.post(`${apiUrl}/auth/oauth2/register`, {
    data: {
      client_name: "E2E Client",
      redirect_uris: [callback],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(response.status()).toBe(201);
  return z.object({ client_id: z.string() }).parse(await response.json()).client_id;
}

function listTools(client: APIRequestContext, token: string) {
  return client.post(`${apiUrl}/mcp`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
}

test("a client connects through sign-in and consent, and Settings revokes it", async ({
  page,
  playwright,
}) => {
  // The client's own HTTP calls: from its servers, without the browser's cookies.
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  const { verifier, challenge } = await pkce();
  // The client's callback: catch the code instead of loading a page that isn't there.
  let code: string | null = null;
  await page.route(`${callback}**`, async (route) => {
    code = new URL(route.request().url()).searchParams.get("code");
    await route.fulfill({ body: "Connected" });
  });

  const authorize = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "collection:read collection:manage offline_access",
    state: "e2e",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${apiUrl}/mcp`,
  });
  await page.goto(`${apiUrl}/auth/oauth2/authorize?${authorize}`);
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
  expect(code).toBeTruthy();

  const tokens = await client.post(`${apiUrl}/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      code: code ?? "",
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: callback,
      resource: `${apiUrl}/mcp`,
    },
  });
  expect(tokens.status()).toBe(200);
  const { access_token: token } = z.object({ access_token: z.string() }).parse(await tokens.json());
  expect((await listTools(client, token)).status()).toBe(200);

  await page.goto("/settings/connections");
  const connection = page.getByRole("listitem").filter({ hasText: "E2E Client" });
  await expect(connection).toContainText("Manage collection");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await connection.getByRole("button", { name: "Revoke E2E Client" }).click();
  await expect(page.getByText("No AI client is connected.")).toBeVisible();
  expect((await listTools(client, token)).status()).toBe(401);
  await client.dispose();
});

test("connecting without changing the mode grants Read-only", async ({ page, playwright }) => {
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  const { verifier, challenge } = await pkce();
  let code: string | null = null;
  await page.route(`${callback}**`, async (route) => {
    code = new URL(route.request().url()).searchParams.get("code");
    await route.fulfill({ body: "Connected" });
  });
  await page.goto("/sign-in");
  await requestCode(page, accounts.mcpDefault, "");
  await page
    .getByLabel("Code", { exact: true })
    .fill((await signInEmail(accounts.mcpDefault)).code);
  await expect(page).not.toHaveURL(/\/sign-in/);

  const authorize = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "collection:read collection:manage offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${apiUrl}/mcp`,
  });
  await page.goto(`${apiUrl}/auth/oauth2/authorize?${authorize}`);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected")).toBeVisible();

  const tokens = await client.post(`${apiUrl}/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      code: code ?? "",
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: callback,
      resource: `${apiUrl}/mcp`,
    },
  });
  const { scope } = z.object({ scope: z.string() }).parse(await tokens.json());
  expect(scope.split(" ").toSorted()).toEqual(["collection:read", "offline_access"]);
  await client.dispose();
});

test("cancelling consent sends the client access_denied", async ({ page, playwright }) => {
  const client = await playwright.request.newContext();
  const clientId = await registerClient(client);
  await client.dispose();
  const { challenge } = await pkce();
  let error: string | null = null;
  await page.route(`${callback}**`, async (route) => {
    error = new URL(route.request().url()).searchParams.get("error");
    await route.fulfill({ body: "Cancelled" });
  });
  await page.goto("/sign-in");
  await requestCode(page, accounts.mcpCancel, "");
  await page.getByLabel("Code", { exact: true }).fill((await signInEmail(accounts.mcpCancel)).code);
  await expect(page).not.toHaveURL(/\/sign-in/);

  const authorize = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: "collection:read offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${apiUrl}/mcp`,
  });
  await page.goto(`${apiUrl}/auth/oauth2/authorize?${authorize}`);
  // The client asked for reading only, so Manage collection isn't offered.
  await expect(page.getByRole("radio")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Cancelled")).toBeVisible();
  expect(error).toBe("access_denied");
});
