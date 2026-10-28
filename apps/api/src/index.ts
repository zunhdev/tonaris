// Starts tonaris-api on the Bun adapter (TS-01, TS-04), and its periodic jobs (TS-91). `bun dev` runs it on port
// 3001 (TS-06). On SIGTERM, as hosts send on deploy, the change streams end first, so the graceful stop doesn't wait
// on them and clients reconnect to the new instance (TS-23). Jobs in progress finish before the database closes.

import { createDatabase } from "@tonaris/db";

import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { apiConfig } from "./config";
import { smtpEmail } from "./email/smtp";
import { createProviders } from "./providers";
import { apiSchedules, startSchedules } from "./schedules";
import { databaseHub } from "./sync/hub";

const config = apiConfig();
const db = createDatabase();
const email = smtpEmail(config);
const auth = createAuth({ config, db, email });
const hub = databaseHub(db);
const providers = createProviders(config, db, hub);
const app = createApp({ config, auth, db, email, hub, capture: providers.capture }).listen(
  config.port,
);
const schedules = startSchedules(
  db,
  apiSchedules(providers.spotify, {
    db,
    publish: (accountId, changes) => hub.publish(accountId, changes),
  }),
);

console.log(`tonaris-api listening on ${app.server?.url.href}`);

async function stop() {
  hub.close();
  await schedules.stop();
  await app.stop();
  await db.$client.end();
  process.exit(0);
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
