// Test helpers: the app on a fresh, migrated test schema (TS-121), with email captured in memory instead of sent.
// Import from tests only.

import { type Database, users } from "@tonaris/db";
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
  options: { env?: Record<string, string>; limiter?: SignInLimiter } = {},
) {
  const database = await createTestDatabase();
  // Tests name the client address in X-Forwarded-For, as a proxy would.
  const config = apiConfig({ CLIENT_IP_HEADER: "x-forwarded-for", ...options.env });
  const email = memoryEmail();
  const auth = createAuth({ config, db: database.db, email, logError: () => {} });
  const app = createApp({
    config,
    auth,
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

  const drop = () => database.drop();
  return { app, auth, config, db: database.db, email, call, drop };
}
