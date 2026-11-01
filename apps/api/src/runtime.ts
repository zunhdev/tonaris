// The API's parts wired together (TS-01, TS-90), one way for the service (src/index.ts), the browser tests' API
// (src/e2e-server.ts), and the app that tests and local tools run (src/testing.ts): the change hub, the job worker
// with every job kind, the email outbox in front of it, Better Auth, and the app. Each caller passes only what
// differs, such as the email transport and the ledger's store; listening and stopping are its own.

import type { LedgerStore } from "@tonaris/db";
import type { EmailPort } from "@tonaris/domain";

import { createApp, type AppOptions } from "./app";
import { type AuthOptions, createAuth } from "./auth/auth";
import { emailJob, emailOutbox } from "./email/outbox";
import { accountDeletionJob } from "./jobs/account-deletion";
import { ledgerJob } from "./jobs/ledger";
import { startJobWorker, type JobWorkerOptions } from "./jobs/worker";
import type { LogError } from "./observability";
import { databaseHub, type SyncHub } from "./sync/hub";

export type RuntimeOptions = Omit<
  AppOptions,
  "auth" | "email" | "hub" | "wakeJobs" | "logError"
> & {
  /** Sends what the email jobs send: the provider's adapter, Mailpit, or memory in tests (TS-72). */
  transport: EmailPort;
  /** Where the ledger's jobs append (TS-113). */
  ledger: LedgerStore;
  /** The change bus; the default serves this process from the database (TS-23). */
  hub?: SyncHub;
  /** Gets the failures nobody waits for: jobs that gave up, work after a response, and unexpected errors. */
  logError?: LogError;
  /** The waits before a failed job runs again (TS-90); tests retry at once. */
  retryDelaysMs?: JobWorkerOptions["retryDelaysMs"];
  /** What sign-in does differently in the browser tests and the other tests (TS-70, TS-61). */
  auth?: Pick<AuthOptions, "secureCookies" | "fetchClientMetadata">;
};

export function createRuntime({
  db,
  config,
  transport,
  ledger,
  logError,
  retryDelaysMs,
  auth: authOptions = {},
  hub = databaseHub(db, logError ? { logError } : {}),
  ...appOptions
}: RuntimeOptions) {
  const logged = logError ? { logError } : {};
  const worker = startJobWorker(
    db,
    [
      emailJob(db, transport),
      accountDeletionJob(db, (accountId) => hub.notify(accountId)),
      ledgerJob(ledger),
    ],
    { ...logged, ...(retryDelaysMs ? { retryDelaysMs } : {}) },
  );
  const email = emailOutbox(db, worker.wake);
  const auth = createAuth({ config, db, email, ...logged, ...authOptions });
  const app = createApp({
    config,
    auth,
    db,
    email,
    hub,
    wakeJobs: worker.wake,
    ...appOptions,
    ...logged,
  });
  return { hub, worker, email, auth, app };
}
