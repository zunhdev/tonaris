// Pictures for Help's AI agents, phone and Help pages (TON-313): an invented client's consent page, its request to
// delete two albums waiting for approval on a phone, the connections in Settings, the phone's collection and album,
// and the account menu. The clients are registered and connected as an AI client would, through OAuth.

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { z } from "zod";

import { apiOrigin, idOf, ids, open, shot, visit } from "./support";

/** Where each client asks to be sent back, as the consent page names it; the run catches it before it leaves. */
const callbacks: Record<string, string> = {
  Claude: "https://claude.ai/api/mcp/auth_callback",
  ChatGPT: "https://chatgpt.com/connector_platform_oauth_redirect",
};
const bothModes = "collection:read collection:manage offline_access";

async function pkce() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

/** Registers a client by DCR under `name`, as an AI client does. */
async function register(client: APIRequestContext, name: string): Promise<string> {
  const response = await client.post(`${apiOrigin}/auth/oauth2/register`, {
    data: {
      client_name: name,
      redirect_uris: [callbacks[name]],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(response.status()).toBe(201);
  return z.object({ client_id: z.string() }).parse(await response.json()).client_id;
}

/** Opens the consent page for a new client called `name`, signed in as Robin. */
async function consent(page: Page, client: APIRequestContext, name: string) {
  const clientId = await register(client, name);
  const callback = callbacks[name] ?? "";
  const { verifier, challenge } = await pkce();
  let code = "";
  await page.route(`${callback}**`, async (route) => {
    code = new URL(route.request().url()).searchParams.get("code") ?? "";
    await route.fulfill({ body: "Connected" });
  });
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callback,
    scope: bothModes,
    state: "pictures",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${apiOrigin}/mcp`,
  });
  await page.goto(`${apiOrigin}/auth/oauth2/authorize?${query.toString()}`);
  await expect(
    page.getByRole("heading", { name: `${name} wants access to your Tonaris collection` }),
  ).toBeVisible();
  return { clientId, verifier, callback, code: () => code };
}

/** Exchanges the code for a token, as the client's server does. */
async function token(
  client: APIRequestContext,
  {
    clientId,
    code,
    verifier,
    callback,
  }: { clientId: string; code: string; verifier: string; callback: string },
) {
  const response = await client.post(`${apiOrigin}/auth/oauth2/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: callback,
      resource: `${apiOrigin}/mcp`,
    },
  });
  expect(response.status()).toBe(200);
  return z.object({ access_token: z.string() }).parse(await response.json()).access_token;
}

/** Calls an MCP tool and returns its structured result. */
async function callTool(client: APIRequestContext, bearer: string, name: string, args: unknown) {
  const response = await client.post(`${apiOrigin}/mcp`, {
    headers: {
      authorization: `Bearer ${bearer}`,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  expect(response.status()).toBe(200);
  const text = await response.text();
  const json = response.headers()["content-type"]?.startsWith("text/event-stream")
    ? (text
        .split("\n")
        .findLast((line) => line.startsWith("data:"))
        ?.slice(5) ?? "")
    : text;
  return z
    .object({ result: z.object({ structuredContent: z.record(z.string(), z.unknown()) }) })
    .parse(JSON.parse(json)).result.structuredContent;
}

test("connecting Claude, a request on a phone, and the connections", async ({
  browser,
  playwright,
}) => {
  const client = await playwright.request.newContext();
  const page = await open(browser, "owner");
  await visit(page, "/c");
  const found = await ids(page);

  // ChatGPT connects to read only, as offered.
  const chatgpt = await consent(page, client, "ChatGPT");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect.poll(chatgpt.code).not.toBe("");

  // Claude's consent page, then Manage collection.
  const claude = await consent(page, client, "Claude");
  await shot(page, "agents-consent", {
    of: [
      page.getByRole("heading", { name: /wants access/ }),
      page.getByRole("button", { name: "Connect" }),
    ],
    pad: 32,
  });
  await page.getByRole("radio", { name: /Manage collection/ }).check();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect.poll(claude.code).not.toBe("");
  const bearer = await token(client, { ...claude, code: claude.code() });

  // Claude asks to delete two albums; Robin decides on a phone.
  const asked = z.object({ approvalId: z.string() }).parse(
    await callTool(client, bearer, "delete_items", {
      albumIds: [idOf(found, "Night Bus Hymns"), idOf(found, "Field Notes")],
    }),
  );
  const phone = await open(browser, "owner", "phone");
  await phone.goto(`/approvals/${asked.approvalId}`);
  await expect(phone.getByRole("button", { name: "Approve" })).toBeVisible();
  await shot(phone, "phone-agents-approval");
  await phone.getByRole("button", { name: "Decline" }).click();

  await visit(page, "/settings/connections");
  const connected = page.getByRole("region", { name: "Connected clients" });
  await expect(connected.getByText("Claude")).toBeVisible();
  await shot(page, "agents-connected-clients", { of: connected, pad: 16 });
});

test("the collection on a phone", async ({ browser }) => {
  const page = await open(browser, "owner", "phone");
  await visit(page, "/c");
  await shot(page, "phone-collection");
});

test("an album on a phone", async ({ browser }) => {
  const page = await open(browser, "owner", "phone");
  await visit(page, "/c");
  await visit(page, `/l/${idOf(await ids(page), "Late night")}`);
  await page.getByRole("gridcell").filter({ hasText: "Blue Hour Sessions" }).first().click();
  await expect(page.getByText(/Open in/).first()).toBeVisible();
  await shot(page, "phone-album-sheet");
});

test("the account menu", async ({ browser }) => {
  const page = await open(browser, "owner");
  await visit(page, "/c");
  await page.getByRole("button", { name: /^Account:/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Feedback and ideas" })).toBeVisible();
  const sidebar = page.getByRole("navigation", { name: "Sidebar" });
  await shot(page, "help-account-menu", {
    of: [menu, sidebar.getByRole("button", { name: /^Account:/ })],
    pad: 16,
  });
});
