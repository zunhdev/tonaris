// The creator's recovery of a sign-in email (FR-11.5, TS-73): one per account, waiting for the new address to
// confirm it with the link's token and code, both kept only as hashes. Confirming swaps the email, ends every
// session of the account, removes its passkeys, disconnects its AI connections when the creator asked, and writes the audit log, in one
// transaction. The member list it starts from shows no collection data (FR-11.6).

import { timingSafeEqual } from "node:crypto";

import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import { emailRecoveryHours, signInCode } from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import { recordInLedger } from "./ledger";
import { removeAllPasskeys } from "./passkeys";
import {
  auditLog,
  emailRecoveries,
  oauthAccessTokens,
  oauthConsents,
  oauthRefreshTokens,
  users,
} from "./schema";
import { isUniqueViolation, swapSignInEmail } from "./sign-in-email";

export type MemberRow = {
  id: string;
  email: string;
  displayName: string | null;
  joinedAt: Date;
  /** The recovery waiting for its new address, if any. */
  recovery: { newEmailKey: string; requestedAt: Date } | null;
};

/** Every account, oldest first: its email, display name and join date, and nothing of its collection. */
export async function listMembers(db: Database): Promise<MemberRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      joinedAt: users.createdAt,
      newEmailKey: emailRecoveries.newEmailKey,
      requestedAt: emailRecoveries.updatedAt,
    })
    .from(users)
    .leftJoin(emailRecoveries, eq(emailRecoveries.userId, users.id))
    // An account being deleted holds a placeholder address until it goes (TS-74).
    .where(isNull(users.deletingAt))
    .orderBy(asc(users.createdAt), asc(users.id));
  return rows.map(({ id, email, displayName, joinedAt, newEmailKey, requestedAt }) => ({
    id,
    email,
    displayName,
    joinedAt,
    recovery: newEmailKey && requestedAt ? { newEmailKey, requestedAt } : null,
  }));
}

/**
 * Starts recovering `userId` to `newEmailKey`, replacing a recovery waiting for it, so the earlier link stops
 * working. Refused for the account's own address, another account's, or no such account.
 */
export async function issueEmailRecovery(
  db: Database,
  {
    now = new Date(),
    ...values
  }: {
    userId: string;
    newEmailKey: string;
    tokenHash: Buffer;
    codeHash: Buffer;
    reason: string;
    disconnectConnections: boolean;
    requestedBy: string;
    now?: Date;
  },
): Promise<"issued" | "same" | "taken" | "missing"> {
  const [account] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, values.userId));
  if (!account) return "missing";
  if (account.email === values.newEmailKey) return "same";
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, values.newEmailKey), ne(users.id, values.userId)));
  if (owner) return "taken";
  const { userId, ...change } = values;
  const fresh = {
    ...change,
    attempts: 0,
    expiresAt: new Date(now.getTime() + emailRecoveryHours * 60 * 60_000),
  };
  await db
    .insert(emailRecoveries)
    .values({ userId, ...fresh })
    .onConflictDoUpdate({ target: emailRecoveries.userId, set: { ...fresh, updatedAt: now } });
  return "issued";
}

/** Cancels the recovery waiting for `userId`'s new address; its link stops working. Answers whether there was one. */
export async function cancelEmailRecovery(db: Database, userId: string): Promise<boolean> {
  const cancelled = await db
    .delete(emailRecoveries)
    .where(eq(emailRecoveries.userId, userId))
    .returning({ userId: emailRecoveries.userId });
  return cancelled.length > 0;
}

/** What confirming did: refused, or the account moved. */
export type EmailRecoveryConfirmation =
  | { outcome: "none" | "expired" | "locked" | "wrong" | "taken" }
  | { outcome: "recovered"; userId: string; from: string; to: string };

/** Ends every AI connection of `userId`: consents and the tokens they gave (TS-61). */
async function disconnectAll(tx: Transaction, userId: string): Promise<void> {
  await tx.delete(oauthAccessTokens).where(eq(oauthAccessTokens.userId, userId));
  await tx.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.userId, userId));
  await tx.delete(oauthConsents).where(eq(oauthConsents.userId, userId));
  await recordInLedger(tx, { type: "connection.revoked", userId, clientId: null });
}

/**
 * Confirms the recovery behind `tokenHash` with its code, under its row's lock. A wrong code counts an attempt,
 * which commits. A right one swaps in this transaction (`swapSignInEmail`, keeping no session), disconnects AI
 * connections if the creator asked, and records the creator, the reason, and the old and new keys (TS-73).
 */
export async function confirmEmailRecovery(
  db: Database,
  {
    tokenHash,
    codeHash,
    auditId,
    now = new Date(),
  }: { tokenHash: Buffer; codeHash: Buffer; auditId: string; now?: Date },
): Promise<EmailRecoveryConfirmation> {
  try {
    return await db.transaction(async (tx): Promise<EmailRecoveryConfirmation> => {
      const [recovery] = await tx
        .select()
        .from(emailRecoveries)
        .where(eq(emailRecoveries.tokenHash, tokenHash))
        .for("update");
      if (!recovery) return { outcome: "none" };
      const its = eq(emailRecoveries.userId, recovery.userId);
      if (recovery.expiresAt <= now) return { outcome: "expired" };
      if (recovery.attempts >= signInCode.attempts) return { outcome: "locked" };
      if (!timingSafeEqual(recovery.codeHash, codeHash)) {
        await tx
          .update(emailRecoveries)
          .set({ attempts: sql`${emailRecoveries.attempts} + 1` })
          .where(its);
        return { outcome: "wrong" };
      }

      await tx.delete(emailRecoveries).where(its);
      const swapped = await swapSignInEmail(tx, {
        userId: recovery.userId,
        newEmailKey: recovery.newEmailKey,
      });
      if (swapped === "taken") return { outcome: "taken" };
      // Someone who took the old address over could have added a passkey (TON-143).
      await removeAllPasskeys(tx, recovery.userId);
      if (recovery.disconnectConnections) await disconnectAll(tx, recovery.userId);
      await tx.insert(auditLog).values({
        id: auditId,
        actor: recovery.requestedBy,
        action: "email.recover",
        subject: recovery.userId,
        details: {
          from: swapped.from,
          to: recovery.newEmailKey,
          reason: recovery.reason,
          disconnectedConnections: recovery.disconnectConnections,
        },
        at: now,
      });
      return {
        outcome: "recovered",
        userId: recovery.userId,
        from: swapped.from,
        to: recovery.newEmailKey,
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "taken" };
    throw error;
  }
}
