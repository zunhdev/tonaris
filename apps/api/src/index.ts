// Starts tonaris-api on the Bun adapter (TS-01, TS-04), its job worker (TS-90) and its periodic jobs (TS-91). `bun
// dev` runs it on port 3001 (TS-06). On SIGTERM, as hosts send on deploy, the change streams end first, so the
// graceful stop doesn't wait on them and clients reconnect to the new instance (TS-23). Jobs in progress finish
// before the database closes.

import { createDatabase, ledgerStore } from "@tonaris/db";

import { maxRequestBodySize } from "./app";
import { syncFeedbackClient } from "./auth/feedback";
import { apiConfig } from "./config";
import { emailTransport } from "./email/transport";
import { apiSchedules, startSchedules } from "./jobs/schedules";
import { log, reportError, startErrorReports } from "./observability";
import { createProviders } from "./providers";
import { createRuntime } from "./runtime";
import { databaseHub } from "./sync/hub";

const config = apiConfig();
// Errors go to the logs, and to Sentry when it is configured, redacted (TS-115).
startErrorReports(config.sentryDsn, config.environment);
const db = createDatabase();
// The providers take the hub to publish what they enrich (TS-42), so it is made before the rest.
const hub = databaseHub(db, { logError: reportError });
const providers = createProviders(config, db, hub);
const { worker, app } = createRuntime({
  db,
  config,
  hub,
  transport: emailTransport(config),
  ledger: ledgerStore(config.ledgerUrl),
  capture: providers.capture,
  covers: providers.covers,
  logError: reportError,
});
// The feedback board's sign-in client, as FEEDBACK_CALLBACK_URL and FEEDBACK_CLIENT_SECRET say (TON-144).
await syncFeedbackClient(db, config.feedback);
app.listen({ port: config.port, maxRequestBodySize });
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
