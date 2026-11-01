// Test helpers: the app on a fresh, migrated test schema (TS-121), with email captured in memory instead of sent.
// Import from tests only.

import { type Database, findUserByEmail, users } from "@tonaris/db";
import { createTestDatabase } from "@tonaris/db/testing";
import {
  emailKey,
  renderEmail,
  type EmailPort,
  type EmailTemplate,
  type EmailTemplates,
  type UserRole,
} from "@tonaris/domain";

import { createApp, maxRequestBodySize } from "./app";
import { issueAdmissionInvitation } from "./auth/admission";
import { type AuthOptions, createAuth } from "./auth/auth";
import { syncFeedbackClient } from "./auth/feedback";
import { createSignInLimiter, type SignInLimiter } from "./auth/sign-in-limits";
import type { CaptureDeps } from "./capture";
import { apiConfig } from "./config";
import { emailJob, emailOutbox } from "./email/outbox";
import type { ImageFetch } from "./img/artwork";
import { accountDeletionJob } from "./jobs/account-deletion";
import { ledgerJob, memoryLedger } from "./jobs/ledger";
import { startJobWorker } from "./jobs/worker";
import type { McpLimiter } from "./mcp/limits";
import type { CoverFinder } from "./routes/v1/covers";
import { databaseHub, type SyncHubOptions } from "./sync/hub";

export type SentEmail = {
  template: EmailTemplate;
  to: string;
  data: EmailTemplates[EmailTemplate];
  subject: string;
  text: string;
};

/**
 * An email adapter that keeps what it sends, in place of the provider's. `next(to)` waits for the next email to that
 * address; an address in `failing` makes sending fail, as an unreachable provider would.
 */
export function memoryEmail() {
  const sent: SentEmail[] = [];
  const failing = new Set<string>();
  const waiting: { to: string; after: number; resolve: (email: SentEmail) => void }[] = [];
  const send: EmailPort["send"] = (template, to, data) => {
    if (failing.has(to)) return Promise.reject(new Error(`Couldn't send to ${to}`));
    const email = { template, to, data, ...renderEmail(template, data) };
    sent.push(email);
    for (const waiter of waiting.filter((w) => w.to === to)) {
      waiting.splice(waiting.indexOf(waiter), 1);
      waiter.resolve(email);
    }
    return Promise.resolve();
  };
  return {
    send,
    sent,
    failing,
    /** Resolves with the first email to `to` sent after `after` emails had gone to it (default: all so far). */
    next(to: string, after = sent.filter((email) => email.to === to).length): Promise<SentEmail> {
      const already = sent.filter((email) => email.to === to)[after];
      if (already) return Promise.resolve(already);
      return new Promise((resolve) => waiting.push({ to, after, resolve }));
    },
  };
}

/** Inserts an account directly, as admission will (TS-71). Returns its id. */
export async function insertUser(
  db: Database,
  email: string,
  values: { role?: UserRole; displayName?: string } = {},
): Promise<string> {
  const id = Bun.randomUUIDv7();
  await db.insert(users).values({ id, email: emailKey(email), emailVerified: true, ...values });
  return id;
}

/** Issues an admission invitation that must succeed, as a fixture (TS-71). */
export async function inviteForTest(
  db: Database,
  values: { email: string; createdBy: string; now?: Date },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const issued = await issueAdmissionInvitation(db, values);
  if (!issued.issued) throw new Error(`Couldn't invite ${values.email}: ${issued.refusal}`);
  return issued;
}

/** Runs `step` for 0 … count-1, each after the previous one finished: for tests that depend on order. */
export function inSequence<T>(count: number, step: (index: number) => Promise<T>): Promise<T[]> {
  return Array.from({ length: count }).reduce<Promise<T[]>>(
    (previous, _, index) => previous.then(async (results) => [...results, await step(index)]),
    Promise.resolve([]),
  );
}

export type LocalAppOptions = {
  env?: Record<string, string>;
  limiter?: SignInLimiter;
  hub?: Omit<SyncHubOptions, "log" | "sessions">;
  /** Serves client metadata documents (CIMD) instead of fetching them. */
  fetchClientMetadata?: AuthOptions["fetchClientMetadata"];
  /** What captures ask, stubbed; without it, captures fail as `provider_unavailable`. */
  capture?: CaptureDeps;
  /** How the image proxy fetches, stubbed; `safeFetch` otherwise (TS-103). */
  imageFetch?: ImageFetch;
  /** Find artwork's search, stubbed; without it, the search answers `provider_unavailable`. */
  covers?: CoverFinder;
  /** MCP's per-connection limits, such as on a test's clock (TS-66). */
  mcpLimiter?: McpLimiter;
};

/**
 * The app on `db`, with email kept in memory: for tests and local tools such as the performance runs. `env`
 * overrides the local configuration; `stop()` ends the streams and the server, and leaves the database.
 */
export function localApp(db: Database, options: LocalAppOptions = {}) {
  // Tests name the client address in X-Forwarded-For, as a proxy would.
  const config = apiConfig({ CLIENT_IP_HEADER: "x-forwarded-for", ...options.env });
  // Email is queued and sent by a worker as in production, quickly retried so failures show at once.
  const email = memoryEmail();
  const hub = databaseHub(db, options.hub);
  const ledger = memoryLedger();
  const worker = startJobWorker(
    db,
    [
      emailJob(db, email),
      accountDeletionJob(db, (accountId) => hub.notify(accountId)),
      ledgerJob(ledger),
    ],
    { retryDelaysMs: [10, 10], logError: () => {} },
  );
  const outbox = emailOutbox(db, worker.wake);
  const auth = createAuth({
    config,
    db,
    email: outbox,
    logError: () => {},
    fetchClientMetadata: options.fetchClientMetadata,
  });
  const app = createApp({
    config,
    auth,
    db,
    email: outbox,
    hub,
    limiter: options.limiter ?? createSignInLimiter(),
    wakeJobs: worker.wake,
    capture: options.capture,
    imageFetch: options.imageFetch,
    covers: options.covers,
    mcpLimiter: options.mcpLimiter,
    logError: () => {},
  });

  /** Calls the app as the web app's browser would: from the web origin, with JSON bodies. */
  const call = (
    path: string,
    init: Omit<RequestInit, "headers"> & { headers?: Record<string, string>; json?: unknown } = {},
  ) => {
    const { json, headers, ...rest } = init;
    return app.handle(
      new Request(`${config.apiOrigin}${path}`, {
        ...rest,
        ...(json === undefined
          ? {}
          : { method: rest.method ?? "POST", body: JSON.stringify(json) }),
        headers: {
          origin: config.webOrigin,
          ...(json === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
      }),
    );
  };

  /**
   * Signs `address` in with an emailed code, as a person would, creating the account the first time. Each call
   * is a new session. Returns the account's ID and the session cookie.
   */
  const signIn = async (address: string): Promise<{ id: string; cookie: string }> => {
    const existing = await findUserByEmail(db, emailKey(address));
    const id = existing?.id ?? (await insertUser(db, address));
    const arrived = email.next(address);
    await call("/auth/email-otp/send-verification-otp", {
      json: { email: address, type: "sign-in" },
    });
    const sent = await arrived;
    if (!("code" in sent.data)) throw new Error(`Expected a code, got ${sent.template}`);
    const response = await call("/auth/sign-in/email-otp", {
      json: { email: address, otp: sent.data.code },
    });
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return { id, cookie };
  };

  /** Listens on `port` (default: a free one), for clients that need a real connection. Returns the origin. */
  const listen = (port = 0): string => {
    app.listen({ port, maxRequestBodySize });
    return (app.server?.url.href ?? "").replace(/\/$/, "");
  };

  const stop = async () => {
    // The streams end first, so the graceful stop lets every other request finish.
    hub.close();
    if (app.server) await app.stop();
    await worker.stop();
  };
  return { app, auth, config, db, email, hub, ledger, call, signIn, listen, stop };
}

/** The app on its own test schema; call `drop()` afterwards. */
export async function createTestApp(options: LocalAppOptions = {}) {
  const database = await createTestDatabase();
  const local = localApp(database.db, options);
  // Better Auth's OAuth provider writes its resource row as it starts; let it finish before a test can drop the
  // schema under it.
  await local.auth.$context;
  await syncFeedbackClient(local.db, local.config.feedback);
  const drop = async () => {
    await local.stop();
    await database.drop();
  };
  return { ...local, drop };
}
