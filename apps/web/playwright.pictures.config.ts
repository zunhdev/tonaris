// The Help pages' pictures (TON-308): `bun run pictures`. Starts the pictures API (apps/api/src/pictures-server.ts),
// which seeds the demo collection of invented albums into a database of its own, and the production web app, then
// takes each picture in pictures/*.pictures.ts and saves it under src/help/pictures/. Not part of `bun run check`.
// Needs the local Postgres and Chromium; nothing reaches the network.

import { defineConfig } from "@playwright/test";

export const picturesPort = 3400;
export const picturesApiPort = 3401;
export const sessionsFile = "playwright/.pictures/sessions.json";

export default defineConfig({
  testDir: "./pictures",
  testMatch: "**/*.pictures.ts",
  // One at a time, in order: a scene may change the demo collection for the ones after it.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${picturesPort}`,
    browserName: "chromium",
    colorScheme: "dark",
    locale: "en-GB",
    timezoneId: "Europe/London",
  },
  webServer: [
    {
      command: "bun src/pictures-server.ts",
      cwd: "../api",
      url: `http://localhost:${picturesApiPort}/healthz`,
      env: {
        PORT: String(picturesApiPort),
        WEB_ORIGIN: `http://localhost:${picturesPort}`,
        PICTURES_SESSIONS_FILE: `${import.meta.dirname}/${sessionsFile}`,
      },
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      timeout: 120_000,
    },
    {
      command: `bun --bun vite build && bun --bun vite preview --port ${picturesPort} --strictPort`,
      url: `http://localhost:${picturesPort}/sign-in`,
      // The sync client on the page tells the run when the workspace is live (src/config.ts).
      // Pages may ask for pictures this run is about to take (scripts/help-pages.ts).
      env: {
        API_URL: `http://localhost:${picturesApiPort}`,
        TEST_HOOKS: "1",
        HELP_PICTURES_PENDING: "1",
      },
      timeout: 120_000,
    },
  ],
});
