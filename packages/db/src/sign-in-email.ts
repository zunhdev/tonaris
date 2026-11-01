// Moving an account's sign-in to a new address (TS-73): the swap that both the self-service change (FR-11.4) and
// the creator's recovery (FR-11.5) end in, the check of their emailed codes, and whether another account holds an
// address. The swap and the check run on the caller's transaction, which writes the audit log too.

import { timingSafeEqual } from "node:crypto";

import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import postgres from "postgres";

import { codeRefusal, type CodeRefusal } from "@tonaris/domain";

import type { Executor, Transaction } from "./client";
import { emailChanges, emailRecoveries, sessions, users } from "./schema";

/** The account other than `userId` whose sign-in email key is `key`, if any. */
export async function emailKeyHolder(
  db: Executor,
  key: string,
  userId: string,
): Promise<string | undefined> {
  const [holder] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, key), ne(users.id, userId)));
  return holder?.id;
}

/**
 * Tries `codeHash` against a stored code, under the lock the caller holds on its row `where` (TS-70): refused while
 * `codeRefusal` says so, "wrong" when it differs, which counts an attempt and commits, and otherwise "right".
 */
export async function checkCode(
  tx: Transaction,
  table: typeof emailChanges | typeof emailRecoveries,
  where: SQL,
  stored: { codeHash: Buffer; expiresAt: Date; attempts: number },
  { codeHash, now }: { codeHash: Buffer; now: Date },
): Promise<CodeRefusal | "wrong" | "right"> {
  const refusal = codeRefusal(stored, now);
  if (refusal) return refusal;
  if (timingSafeEqual(stored.codeHash, codeHash)) return "right";
  await tx
    .update(table)
    .set({ attempts: sql`${table.attempts} + 1` })
    .where(where);
  return "wrong";
}

/**
 * Moves `userId` to `newEmailKey`, verified, unless another account holds that key, and ends the account's
 * sessions but `keepSessionId`. Locks the account, so two swaps of it run one after the other. Answers the old key,
 * or "taken". A deleted account is "taken" too: there is nothing left to move.
 */
export async function swapSignInEmail(
  tx: Transaction,
  {
    userId,
    newEmailKey,
    keepSessionId,
  }: { userId: string; newEmailKey: string; keepSessionId?: string },
): Promise<{ from: string } | "taken"> {
  const [account] = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (!account || (await emailKeyHolder(tx, newEmailKey, userId))) return "taken";

  await tx
    .update(users)
    .set({ email: newEmailKey, emailVerified: true })
    .where(eq(users.id, userId));
  const own = eq(sessions.userId, userId);
  await tx
    .delete(sessions)
    .where(keepSessionId === undefined ? own : and(own, ne(sessions.id, keepSessionId)));
  return { from: account.email };
}

/** A unique violation, as postgres.js reports it, whether or not Drizzle wrapped it: an account took the key. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof postgres.PostgresError && current.code === "23505") return true;
    current = current.cause;
  }
  return false;
}
