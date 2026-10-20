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

import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { createSignInLimiter, type SignInLimiter } from "./auth/sign-in-limits";
import { apiConfig } from "./config";
import { createSyncHub, databaseLog, type SyncHubOptions } from "./sync/hub";

export type SentEmail = {
  template: EmailTemplate;
  to: string;
  data: EmailTemplates[EmailTemplate];
  subject: string;
  text: string;
};

/** An email port that keeps what it sends. `next(to)` waits for the next email to that address. */
export function memoryEmail() {
  const sent: SentEmail[] = [];
  const waiting: { to: string; after: number; resolve: (email: SentEmail) => void }[] = [];
  const send: EmailPort["send"] = (template, to, data) => {
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

/** Runs `step` for 0 … count-1, each after the previous one finished: for tests that depend on order. */
export function inSequence<T>(count: number, step: (index: number) => Promise<T>): Promise<T[]> {
  return Array.from({ length: count }).reduce<Promise<T[]>>(
    (previous, _, index) => previous.then(async (results) => [...results, await step(index)]),
    Promise.resolve([]),
  );
}

/** The app on its own test schema. `env` overrides the local configuration; call `drop()` afterwards. */
export async function createTestApp(
  options: {
    env?: Record<string, string>;
    limiter?: SignInLimiter;
    hub?: Omit<SyncHubOptions, "log">;
  } = {},
) {
  const database = await createTestDatabase();
  // Tests name the client address in X-Forwarded-For, as a proxy would.
  const config = apiConfig({ CLIENT_IP_HEADER: "x-forwarded-for", ...options.env });
  const email = memoryEmail();
  const auth = createAuth({ config, db: database.db, email, logError: () => {} });
  const hub = createSyncHub({ log: databaseLog(database.db), ...options.hub });
  const app = createApp({
    config,
    auth,
    db: database.db,
    hub,
    limiter: options.limiter ?? createSignInLimiter(),
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
    const existing = await findUserByEmail(database.db, emailKey(address));
    const id = existing?.id ?? (await insertUser(database.db, address));
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

  /** Listens on a free port, for clients that need a real connection such as streams. Returns the API origin. */
  const listen = (): string => {
    app.listen({ port: 0 });
    return (app.server?.url.href ?? "").replace(/\/$/, "");
  };

  const drop = async () => {
    // The streams end first, so the graceful stop lets every other request finish before the schema goes.
    hub.close();
    if (app.server) await app.stop();
    await database.drop();
  };
  return { app, auth, config, db: database.db, email, hub, call, signIn, listen, drop };
}
