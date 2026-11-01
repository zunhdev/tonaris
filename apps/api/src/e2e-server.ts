// The API for the browser tests (TS-121), started by Playwright (apps/web/playwright.config.ts). It serves a fresh,
// migrated schema of the test database with the accounts in E2E_ACCOUNTS (the first is the creator), sends email
// to Mailpit, answers captures from fixtures, and drops the schema when it stops. Not part of the deployable
// service. Every account has agreed to the current terms, except those whose address starts `unagreed-`, which
// meet the agreement screen (TON-131).

import { agreeToTerms } from "@tonaris/db";
import { createTestDatabase } from "@tonaris/db/testing";
import { emailKey, termsVersion } from "@tonaris/domain";

import { maxRequestBodySize } from "./app";
import { seedCreator } from "./auth/seed-creator";
import { createSignInLimiter, signInLimits } from "./auth/sign-in-limits";
import { fixtureCapture, fixtureCovers, fixtureImageFetch } from "./capture-fixtures";
import { apiConfig } from "./config";
import { smtpEmail } from "./email/smtp";
import { memoryLedger } from "./jobs/ledger";
import { createRuntime } from "./runtime";
import { insertUser } from "./testing";

const port = Number(process.env.PORT ?? 3101);
const [creator, ...others] = (process.env.E2E_ACCOUNTS ?? "").split(",").filter(Boolean);
if (!creator) throw new Error("Set E2E_ACCOUNTS to the comma-separated accounts to create.");

const database = await createTestDatabase();
await seedCreator(database.db, creator);
await Promise.all(others.map((email) => insertUser(database.db, email)));
await Promise.all(
  [creator, ...others]
    .filter((email) => !email.startsWith("unagreed-"))
    .map((email) => agreeToTerms(database.db, { emailKey: emailKey(email) }, termsVersion)),
);

const config = apiConfig({
  PORT: String(port),
  API_ORIGIN: `http://localhost:${port}`,
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3100",
});
const { hub, worker, app } = createRuntime({
  db: database.db,
  config,
  transport: smtpEmail(config),
  // The browser tests check the app, not the ledger: it is kept in memory and dropped with the schema.
  ledger: memoryLedger(),
  // Playwright's WebKit keeps no `Secure` cookie on http://localhost, so its run asks for plain ones (TON-94).
  auth: { secureCookies: process.env.E2E_INSECURE_COOKIES !== "1" },
  // Every test signs in from 127.0.0.1, so the per-address limit would count the whole suite as one person.
  limiter: createSignInLimiter({
    perEmail: signInLimits.perEmail,
    perIp: { ...signInLimits.perIp, max: 10_000 },
  }),
  // Captures and artwork are answered from fixtures, not MusicBrainz or image hosts (TON-45, TON-48).
  capture: fixtureCapture(),
  imageFetch: fixtureImageFetch,
  covers: fixtureCovers,
});
app.listen({ port, maxRequestBodySize });
console.log(`e2e API on ${app.server?.url.href}, schema ${database.schema}`);

async function stop() {
  hub.close();
  await app.stop();
  await worker.stop();
  await database.drop();
  process.exit(0);
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
