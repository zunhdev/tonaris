// The API for the browser tests (TS-121), started by Playwright (apps/web/playwright.config.ts). It serves a fresh,
// migrated schema of the test database with the accounts in E2E_ACCOUNTS (the first is the creator), sends email
// to Mailpit, and drops the schema when it stops. Not part of the deployable service.

import { createTestDatabase } from "@tonaris/db/testing";

import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { seedCreator } from "./auth/seed-creator";
import { createSignInLimiter, signInLimits } from "./auth/sign-in-limits";
import { apiConfig } from "./config";
import { smtpEmail } from "./email/smtp";
import { createSyncHub, databaseLog } from "./sync/hub";
import { insertUser } from "./testing";

const port = Number(process.env.PORT ?? 3101);
const [creator, ...others] = (process.env.E2E_ACCOUNTS ?? "").split(",").filter(Boolean);
if (!creator) throw new Error("Set E2E_ACCOUNTS to the comma-separated accounts to create.");

const database = await createTestDatabase();
await seedCreator(database.db, creator);
await Promise.all(others.map((email) => insertUser(database.db, email)));

const config = apiConfig({
  PORT: String(port),
  API_ORIGIN: `http://localhost:${port}`,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3100",
});
const auth = createAuth({ config, db: database.db, email: smtpEmail(config) });
// Every test signs in from 127.0.0.1, so the per-address limit would count the whole suite as one person.
const limiter = createSignInLimiter({
  perEmail: signInLimits.perEmail,
  perIp: { ...signInLimits.perIp, max: 10_000 },
});
const hub = createSyncHub({ log: databaseLog(database.db) });
const app = createApp({ config, auth, db: database.db, hub, limiter }).listen(port);
console.log(`e2e API on ${app.server?.url.href}, schema ${database.schema}`);

async function stop() {
  hub.close();
  await app.stop();
  await database.drop();
  process.exit(0);
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
