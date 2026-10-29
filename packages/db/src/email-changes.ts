// The sign-in email change's storage (FR-11.4, TS-73): one change per account, its code kept as a hash, and the
// swap, which changes the email, ends the account's other sessions and writes the audit log in one transaction.

import { timingSafeEqual } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";

import { signInCode } from "@tonaris/domain";

import type { Database } from "./client";
import { auditLog, emailChanges, users } from "./schema";
import { isUniqueViolation, swapSignInEmail } from "./sign-in-email";

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
 * `nextCodeHash`. The new address's code swaps in this transaction (`swapSignInEmail`), keeping `sessionId`, and
 * writes the audit log (TS-73).
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

      await tx.delete(emailChanges).where(mine);
      const swapped = await swapSignInEmail(tx, {
        userId,
        newEmailKey: change.newEmailKey,
        keepSessionId: sessionId,
      });
      if (swapped === "taken") return { outcome: "taken" };
      await tx.insert(auditLog).values({
        id: auditId,
        actor: userId,
        action: "email.change",
        subject: userId,
        details: { from: swapped.from, to: change.newEmailKey },
        at: now,
      });
      return { outcome: "changed", from: swapped.from, to: change.newEmailKey };
    });
  } catch (error) {
    // An account took the key between the check and the swap.
    if (isUniqueViolation(error)) return { outcome: "taken" };
    throw error;
  }
}
