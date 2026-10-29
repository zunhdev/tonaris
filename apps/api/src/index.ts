// Starts tonaris-api on the Bun adapter (TS-01, TS-04), its job worker (TS-90) and its periodic jobs (TS-91). `bun
// dev` runs it on port 3001 (TS-06). On SIGTERM, as hosts send on deploy, the change streams end first, so the
// graceful stop doesn't wait on them and clients reconnect to the new instance (TS-23). Jobs in progress finish
// before the database closes.

import { createDatabase, ledgerStore } from "@tonaris/db";

import { accountDeletionJob } from "./account-deletion";
import { createApp, maxRequestBodySize } from "./app";
import { createAuth } from "./auth/auth";
import { apiConfig } from "./config";
import { emailJob, emailOutbox } from "./email/outbox";
import { emailTransport } from "./email/transport";
import { startJobWorker } from "./jobs";
import { ledgerJob } from "./ledger";
import { log, reportError, startErrorReports } from "./observability";
import { createProviders } from "./providers";
import { apiSchedules, startSchedules } from "./schedules";
import { databaseHub } from "./sync/hub";

const config = apiConfig();
// Errors go to the logs, and to Sentry when it is configured, redacted (TS-115).
startErrorReports(config.sentryDsn, config.environment);
const db = createDatabase();
const hub = databaseHub(db, {
  logError: (error) => reportError(error, "Checking stream sessions"),
});
const worker = startJobWorker(
  db,
  [
    emailJob(db, emailTransport(config)),
    accountDeletionJob(db, (accountId) => hub.notify(accountId)),
    ledgerJob(ledgerStore(config.ledgerUrl)),
  ],
  { logError: reportError },
);
const email = emailOutbox(db, worker.wake);
const auth = createAuth({ config, db, email, logError: reportError });
const providers = createProviders(config, db, hub);
const app = createApp({
  config,
  auth,
  db,
  email,
  hub,
  wakeJobs: worker.wake,
  capture: providers.capture,
  logError: reportError,
}).listen({ port: config.port, maxRequestBodySize });
const schedules = startSchedules(
  db,
  apiSchedules(providers.spotify, {
    db,
    publish: (accountId, changes) => hub.publish(accountId, changes),
  }),
  { logError: (error, schedule) => reportError(error, `Schedule ${schedule}`) },
);

log("info", "tonaris-api listening", { url: app.server?.url.href });

async function stop() {
  hub.close();
  await schedules.stop();
  await app.stop();
  await worker.stop();
  await db.$client.end();
  process.exit(0);
}
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
