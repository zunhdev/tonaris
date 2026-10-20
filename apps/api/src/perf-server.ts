// The API for the performance runs (TS-120, TON-21): the reference workload on a database of its own, with
// signed-in sessions for the Playwright perf suite (apps/web/playwright.perf.config.ts). On start it creates and
// migrates `tonaris_perf` (or PERF_DATABASE_URL), seeds the workload with the tooling seeder in a child process,
// signs the workload owner in twice and the largest sharer once, writes the cookies to PERF_SESSIONS_FILE, and
// listens on PORT. Not part of the deployable service.

import path from "node:path";

import { createDatabase, migrateDatabase, redact } from "@tonaris/db";
import { ensureDatabase } from "@tonaris/db/testing";

import { createSignInLimiter, signInLimits } from "./auth/sign-in-limits";
import { localApp } from "./testing";

const url = process.env.PERF_DATABASE_URL ?? "postgres://postgres@localhost:5432/tonaris_perf";
const port = Number(process.env.PORT ?? 3201);
const sessionsFile = process.env.PERF_SESSIONS_FILE;
if (!sessionsFile) throw new Error("Set PERF_SESSIONS_FILE to where the session cookies go.");

await ensureDatabase(url);
const db = createDatabase(url, { max: 10 });
await migrateDatabase(db);

// The seeder lives in tooling, which the API may not import (TS-02), so it runs as its own process.
const seeder = path.join(import.meta.dir, "../../../tooling/src/workload/seed.ts");
const seeded = Bun.spawnSync(["bun", seeder], {
  env: { ...process.env, DATABASE_URL: url },
  stdout: "inherit",
  stderr: "inherit",
});
if (seeded.exitCode !== 0) throw new Error(`Seeding the workload into ${redact(url)} failed.`);

const unlimited = { max: 10_000, windowMs: signInLimits.perIp.windowMs };
const app = localApp(db, {
  env: {
    API_ORIGIN: process.env.API_ORIGIN ?? `http://localhost:${port}`,
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3200",
  },
  limiter: createSignInLimiter({ perEmail: unlimited, perIp: unlimited }),
});

const owner = "workload@tonaris.test";
const viewer = "workload-sharer-1@tonaris.test";
const sessions = {
  owner: [(await app.signIn(owner)).cookie, (await app.signIn(owner)).cookie],
  // The owner of the largest shared collection, 2,000 albums: its snapshot stands in for a viewer's refetch.
  sharer: (await app.signIn(viewer)).cookie,
};
await Bun.write(sessionsFile, JSON.stringify(sessions));

console.log(`perf API on ${app.listen(port)}, database ${redact(url)}`);

async function stop() {
  await app.stop();
  await db.$client.end();
  process.exit(0);
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
