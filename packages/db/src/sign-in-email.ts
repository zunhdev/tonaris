// Moving an account's sign-in to a new address (TS-73): the swap that both the self-service change (FR-11.4) and
// the creator's recovery (FR-11.5) end in. It runs on the caller's transaction, which writes the audit log too.

import { and, eq, ne } from "drizzle-orm";
import postgres from "postgres";

import type { Transaction } from "./client";
import { sessions, users } from "./schema";

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
  const [owner] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, newEmailKey), ne(users.id, userId)));
  if (!account || owner) return "taken";

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
