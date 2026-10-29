// Browser tests (TS-121): Chromium against a fresh production build served by `vite preview`, calling the e2e API
// (apps/api/src/e2e-server.ts) on a fresh test schema, with email read from Mailpit. So `bun run test:e2e` needs
// the local Postgres and Mailpit (TS-06). Files are `*.e2e.ts`, so `bun test` leaves them alone; Playwright
// needs Node.

import { defineConfig, devices } from "@playwright/test";

import { accounts, apiUrl, creatorState } from "./e2e/support/accounts";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    // Signs the creator in once; the workspace tests start from that state.
    { name: "setup", testMatch: "**/*.setup.ts" },
    {
      name: "chromium",
      testMatch: "**/*.e2e.ts",
      testIgnore: "**/mobile.e2e.ts",
      use: { ...devices["Desktop Chrome"], storageState: creatorState },
      dependencies: ["setup"],
    },
    // The rest of TS-122's matrix in Playwright's engines (TON-94): `bun run test:e2e:matrix`. Edge is Chromium.
    {
      name: "firefox",
      testMatch: "**/*.e2e.ts",
      testIgnore: "**/mobile.e2e.ts",
      use: { ...devices["Desktop Firefox"], storageState: creatorState },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      testMatch: "**/*.e2e.ts",
      testIgnore: "**/mobile.e2e.ts",
      use: { ...devices["Desktop Safari"], storageState: creatorState },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "bun src/e2e-server.ts",
      cwd: "../api",
      url: `${apiUrl}/healthz`,
      env: {
        PORT: "3101",
        WEB_ORIGIN: `http://localhost:${port}`,
        E2E_ACCOUNTS: Object.values(accounts).join(","),
        // Set by `test:e2e:webkit` for WebKit, which keeps no Secure cookie on http://localhost (TON-94).
        E2E_INSECURE_COOKIES: process.env.E2E_INSECURE_COOKIES ?? "",
      },
      // SIGTERM lets the server drop its schema.
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      timeout: 60_000,
    },
    {
      command: `bun --bun vite build && bun --bun vite preview --port ${port} --strictPort`,
      url: `http://localhost:${port}/sign-in`,
      // The production build, with the sync client exposed to the tests (src/config.ts).
      env: { API_URL: apiUrl, TEST_HOOKS: "1" },
      timeout: 120_000,
    },
  ],
});
