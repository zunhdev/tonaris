// Work only one instance may do at a time, such as a periodic job (TS-90): a Postgres advisory lock taken for one
// transaction, so it is released with it and no pooled connection keeps it.

import { sql } from "drizzle-orm";

import type { Database, Transaction } from "./client";

/**
 * Runs `task` in a transaction holding the advisory lock named `name`, unless another transaction holds it.
 * Answers whether it ran.
 */
export function runExclusively(
  db: Database,
  name: string,
  task: (tx: Transaction) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext(${name})) as locked`,
    );
    if (!lock?.locked) return false;
    await task(tx);
    return true;
  });
}
