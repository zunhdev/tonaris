// The API for client tests that run outside a browser, such as the web app's sync client tests (TS-121). It
// serves a fresh, migrated schema of the test database, creates TEST_ACCOUNTS accounts with two signed-in
// sessions each (email codes are read in memory), prints one JSON line — `{ url, webOrigin, accounts }` —
// and drops the schema on SIGTERM. Not part of the deployable service.

import { createSignInLimiter, signInLimits } from "./auth/sign-in-limits";
import { createTestApp } from "./testing";

const count = Number(process.env.TEST_ACCOUNTS ?? 1);

// Every session is signed in from here at once, which the sign-in limits would refuse.
const unlimited = { max: 10_000, windowMs: signInLimits.perIp.windowMs };
const t = await createTestApp({
  limiter: createSignInLimiter({ perEmail: unlimited, perIp: unlimited }),
});
const url = t.listen();
const accounts = [];
for (let index = 0; index < count; index += 1) {
  const email = `account-${index}@test.tonaris.test`;
  // oxlint-disable-next-line no-await-in-loop
  const first = await t.signIn(email);
  // oxlint-disable-next-line no-await-in-loop
  const second = await t.signIn(email);
  accounts.push({ id: first.id, email, sessions: [first.cookie, second.cookie] });
}
console.log(JSON.stringify({ url, webOrigin: t.config.webOrigin, accounts }));

async function stop() {
  // A request a client gave up on just before may still be running (the server can't cancel it); give it a moment
  // to finish before its connections and schema go.
  await Bun.sleep(100);
  await t.drop();
  process.exit(0);
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
