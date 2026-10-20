// The performance run (TS-120, TON-21): `bun run test:perf`. Chromium opens the perf page (perf/) against the
// reference workload, once per reference device, with Chrome's own network and CPU throttling. Not part of
// `bun run check`. Needs the local Postgres; results land in perf/results/.

import { defineConfig } from "@playwright/test";

export const perfPort = 3200;
export const perfApiPort = 3201;
export const sessionsFile = "playwright/.perf/sessions.json";

export default defineConfig({
  testDir: "./perf",
  testMatch: "**/*.perf.ts",
  // One at a time: the profiles would otherwise share the CPU they measure.
  workers: 1,
  timeout: 5 * 60_000,
  reporter: "list",
  use: { baseURL: `http://localhost:${perfPort}` },
  webServer: [
    {
      command: "bun src/perf-server.ts",
      cwd: "../api",
      url: `http://localhost:${perfApiPort}/healthz`,
      env: {
        PORT: String(perfApiPort),
        WEB_ORIGIN: `http://localhost:${perfPort}`,
        PERF_SESSIONS_FILE: `${import.meta.dirname}/${sessionsFile}`,
      },
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      timeout: 120_000,
    },
    {
      command: `bun --bun vite build --config perf/vite.config.ts && bun --bun vite preview --config perf/vite.config.ts`,
      url: `http://localhost:${perfPort}/`,
      timeout: 120_000,
    },
  ],
});
