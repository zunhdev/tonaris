// The API for the Help pages' pictures (TON-308): the demo collection on a database of its own, with signed-in
// sessions for the pictures run (apps/web/playwright.pictures.config.ts). On start it creates and migrates
// `tonaris_pictures` (or PICTURES_DATABASE_URL), seeds the demo with the tooling seeder in a child process, signs
// Robin, Mira and Sam in, writes their cookies and Late night's link token to PICTURES_SESSIONS_FILE, and listens on
// PORT. Captures and artwork come from the browser tests' fixtures, so nothing reaches the network. Not part of the
// deployable service.

import path from "node:path";

import { closeDatabase, createDatabase, migrateDatabase, redact } from "@tonaris/db";
import { ensureDatabase } from "@tonaris/db/testing";

import { createSignInLimiter, signInLimits } from "./auth/sign-in-limits";
import { fixtureCapture, fixtureCovers, fixtureImageFetch } from "./capture-fixtures";
import { createRequestLimiter, relaxedRequestLimits } from "./request-limits";
import { localApp } from "./testing";

const url =
  process.env.PICTURES_DATABASE_URL ?? "postgres://postgres@localhost:5432/tonaris_pictures";
const port = Number(process.env.PORT ?? 3401);
const sessionsFile = process.env.PICTURES_SESSIONS_FILE;
if (!sessionsFile) throw new Error("Set PICTURES_SESSIONS_FILE to where the session cookies go.");

await ensureDatabase(url);
const db = createDatabase(url, { max: 10 });
await migrateDatabase(db);

// The seeder lives in tooling, which the API may not import (TS-02), so it runs as its own process.
const seeder = path.join(import.meta.dir, "../../../tooling/src/demo/seed.ts");
const infoFile = `${sessionsFile}.demo.json`;
const seeded = Bun.spawnSync(["bun", seeder], {
  env: { ...process.env, DATABASE_URL: url, DEMO_INFO_FILE: infoFile },
  stdout: "inherit",
  stderr: "inherit",
});
if (seeded.exitCode !== 0) throw new Error(`Seeding the demo into ${redact(url)} failed.`);
const info: unknown = await Bun.file(infoFile).json();
const linkToken =
  typeof info === "object" && info !== null && "linkToken" in info ? info.linkToken : undefined;
if (typeof linkToken !== "string")
  throw new Error(`The seeder wrote no link token to ${infoFile}.`);

const unlimited = { max: 10_000, windowMs: signInLimits.perIp.windowMs };
const app = localApp(db, {
  env: {
    API_ORIGIN: process.env.API_ORIGIN ?? `http://localhost:${port}`,
    WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3400",
  },
  limiter: createSignInLimiter({ perEmail: unlimited, perIp: unlimited }),
  requestLimiter: createRequestLimiter(relaxedRequestLimits),
  capture: fixtureCapture(),
  imageFetch: fixtureImageFetch,
  covers: fixtureCovers,
});

const sessions = {
  owner: (await app.signIn("robin@demo.tonaris.test")).cookie,
  mira: (await app.signIn("mira@demo.tonaris.test")).cookie,
  sam: (await app.signIn("sam@demo.tonaris.test")).cookie,
  linkToken,
};
await Bun.write(sessionsFile, JSON.stringify(sessions));

console.log(`pictures API on ${app.listen(port)}, database ${redact(url)}`);

async function stop() {
  await app.stop();
  await closeDatabase(db);
  process.exit(0);
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
