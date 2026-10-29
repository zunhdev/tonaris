// The sign-in email change's storage (FR-11.4, TS-73): one change per account, its code kept as a hash, and the
// swap, which changes the email, ends the account's other sessions and writes the audit log in one transaction.

import { timingSafeEqual } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";
import postgres from "postgres";

import { signInCode } from "@tonaris/domain";

import type { Database } from "./client";
import { auditLog, emailChanges, sessions, users } from "./schema";

export type EmailChangeRow = typeof emailChanges.$inferSelect;

/** A code works for 10 minutes, as a sign-in code does (TS-70). */
const codeLifetimeMs = signInCode.validMinutes * 60_000;

const expiry = (now: Date) => new Date(now.getTime() + codeLifetimeMs);

/**
 * Starts a change to `newEmailKey` with the current address's code, replacing a change in progress, so its codes
 * stop working. Refused when another account has that key.
 */
export async function startEmailChange(
  db: Database,
  {
    userId,
    newEmailKey,
    codeHash,
    now = new Date(),
  }: { userId: string; newEmailKey: string; codeHash: Buffer; now?: Date },
): Promise<"started" | "taken"> {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, newEmailKey), ne(users.id, userId)));
  if (owner) return "taken";
  const values = {
    newEmailKey,
    stage: "current" as const,
    codeHash,
    attempts: 0,
    expiresAt: expiry(now),
  };
  await db
    .insert(emailChanges)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: emailChanges.userId, set: values });
  return "started";
}

export async function findEmailChange(
  db: Database,
  userId: string,
): Promise<EmailChangeRow | undefined> {
  const [change] = await db.select().from(emailChanges).where(eq(emailChanges.userId, userId));
  return change;
}

/** Gives the change's step a new code, as a resend does; the earlier code stops working. */
export async function renewEmailChangeCode(
  db: Database,
  { userId, codeHash, now = new Date() }: { userId: string; codeHash: Buffer; now?: Date },
): Promise<EmailChangeRow | undefined> {
  const [change] = await db
    .update(emailChanges)
    .set({ codeHash, attempts: 0, expiresAt: expiry(now) })
    .where(eq(emailChanges.userId, userId))
    .returning();
  return change;
}

export async function cancelEmailChange(db: Database, userId: string): Promise<void> {
  await db.delete(emailChanges).where(eq(emailChanges.userId, userId));
}

/** What a code did: refused, the new address's step reached, or the email changed. */
export type EmailChangeSubmission =
  | { outcome: "none" | "expired" | "locked" | "wrong" | "taken" }
  | { outcome: "advanced"; change: EmailChangeRow }
  | { outcome: "changed"; from: string; to: string };

/**
 * Checks a code for the change's step under its row's lock, so two right codes can't both act. A wrong one
 * counts an attempt, which commits. The current address's code moves the change to the new address's step, with
 * `nextCodeHash`. The new address's code swaps in this transaction: it changes the email unless another account
 * has the key, ends the account's sessions other than `sessionId`, and writes the audit log (TS-73).
 */
export async function submitEmailChangeCode(
  db: Database,
  {
    userId,
    sessionId,
    codeHash,
    nextCodeHash,
    auditId,
    now = new Date(),
  }: {
    userId: string;
    sessionId: string;
    codeHash: Buffer;
    nextCodeHash: Buffer;
    auditId: string;
    now?: Date;
  },
): Promise<EmailChangeSubmission> {
  try {
    return await db.transaction(async (tx): Promise<EmailChangeSubmission> => {
      const mine = eq(emailChanges.userId, userId);
      const [change] = await tx.select().from(emailChanges).where(mine).for("update");
      if (!change) return { outcome: "none" };
      if (change.expiresAt <= now) return { outcome: "expired" };
      if (change.attempts >= signInCode.attempts) return { outcome: "locked" };
      if (!timingSafeEqual(change.codeHash, codeHash)) {
        await tx
          .update(emailChanges)
          .set({ attempts: sql`${emailChanges.attempts} + 1` })
          .where(mine);
        return { outcome: "wrong" };
      }

      if (change.stage === "current") {
        const [advanced] = await tx
          .update(emailChanges)
          .set({ stage: "new", codeHash: nextCodeHash, attempts: 0, expiresAt: expiry(now) })
          .where(mine)
          .returning();
        return advanced ? { outcome: "advanced", change: advanced } : { outcome: "none" };
      }

      const [account] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, change.newEmailKey), ne(users.id, userId)));
      await tx.delete(emailChanges).where(mine);
      if (!account || owner) return { outcome: "taken" };

      await tx
        .update(users)
        .set({ email: change.newEmailKey, emailVerified: true })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId)));
      await tx.insert(auditLog).values({
        id: auditId,
        actor: userId,
        action: "email.change",
        subject: userId,
        details: { from: account.email, to: change.newEmailKey },
        at: now,
      });
      return { outcome: "changed", from: account.email, to: change.newEmailKey };
    });
  } catch (error) {
    // An account took the key between the check and the swap.
    if (isUniqueViolation(error)) return { outcome: "taken" };
    throw error;
  }
}

/** A unique violation, as postgres.js reports it, whether or not Drizzle wrapped it. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof postgres.PostgresError && current.code === "23505") return true;
    current = current.cause;
  }
  return false;
}
