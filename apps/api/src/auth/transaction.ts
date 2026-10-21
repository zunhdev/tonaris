// One Postgres transaction for Better Auth's writes and Tonaris's (TS-71). Better Auth's `runWithTransaction`
// opens a transaction through its Drizzle adapter and runs its own queries on it: codes, users, sessions. The
// adapter opens it with `db.transaction`, so a database that records each transaction it opens lets Tonaris's
// queries join the same one.

import { AsyncLocalStorage } from "node:async_hooks";

import { runWithTransaction } from "@better-auth/core/context";

import type { Database, Transaction } from "@tonaris/db";

import type { Auth } from "./auth";

const opened = new AsyncLocalStorage<Transaction>();

/** `db` for Better Auth's adapter: the same connections, with each transaction it opens recorded. */
export function recordingTransactions(db: Database): Database {
  const transaction: Database["transaction"] = (run, config) =>
    db.transaction((tx) => opened.run(tx, () => run(tx)), config);
  return new Proxy(db, {
    get: (target, key, receiver) =>
      key === "transaction" ? transaction : Reflect.get(target, key, receiver),
  });
}

/**
 * Runs `work` in one transaction that Better Auth's own queries join, such as `auth.api.signInEmailOTP` consuming
 * the code and creating the session. It commits when `work` returns and rolls back when it throws.
 */
export async function inAuthTransaction<T>(
  auth: Auth,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const { adapter } = await auth.$context;
  return runWithTransaction(adapter, () => {
    const tx = opened.getStore();
    // Without it, Tonaris's queries would run outside Better Auth's transaction; refuse rather than half-commit.
    if (!tx) throw new Error("Better Auth opened no transaction on the recording database.");
    return work(tx);
  });
}
