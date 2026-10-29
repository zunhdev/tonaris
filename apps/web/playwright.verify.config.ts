// The Q-01 verification on the real app (TS-120, TON-92): `bun run test:verify`. Starts the API and the production
// web app on the local database, whose `workload@tonaris.test` holds the reference workload (`bun run
// seed:workload`), and measures what the perf page can't: quick search in the palette, the guest page's LCP and the
// export. Not part of `bun run check`. Needs the local Postgres and Mailpit; results land in perf/results/.

import { defineConfig } from "@playwright/test";

export const verifyPort = 3300;
export const verifyApiPort = 3301;

export default defineConfig({
  testDir: "./perf",
  testMatch: "**/*.verify.ts",
  workers: 1,
  timeout: 10 * 60_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${verifyPort}` },
  webServer: [
    {
      command: "bun src/index.ts",
      cwd: "../api",
      url: `http://localhost:${verifyApiPort}/healthz`,
      env: { PORT: String(verifyApiPort), WEB_ORIGIN: `http://localhost:${verifyPort}` },
      timeout: 60_000,
    },
    {
      command: "bun --bun vite build && bun server.ts",
      url: `http://localhost:${verifyPort}/sign-in`,
      env: {
        PORT: String(verifyPort),
        API_URL: `http://localhost:${verifyApiPort}`,
        NODE_ENV: "production",
      },
      timeout: 120_000,
    },
  ],
});
