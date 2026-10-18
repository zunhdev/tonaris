// Browser tests (TS-121): Chromium against a fresh production build served by `vite preview`.
// Files are `*.e2e.ts`, so `bun test` leaves them alone. Run with `bun run test:e2e` (Playwright needs Node).

import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun --bun vite build && bun --bun vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}/sign-in`,
    timeout: 120_000,
  },
});
