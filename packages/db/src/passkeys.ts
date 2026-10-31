// A member's passkeys in Settings → Account (DS-93, TON-143): Better Auth's passkey plugin adds them and signs in
// with them; listing, renaming and removing go through /v1. A removal is recorded in the ledger (TS-113), so a
// restored backup doesn't bring the passkey back.

import { and, desc, eq } from "drizzle-orm";

import type { Database, Transaction } from "./client";
import { recordInLedger } from "./ledger";
import { passkeys } from "./schema";

export type PasskeyRow = { id: string; name: string | null; createdAt: Date };

const listed = { id: passkeys.id, name: passkeys.name, createdAt: passkeys.createdAt };

/** `userId`'s passkeys, newest first. */
export function listPasskeys(db: Database, userId: string): Promise<PasskeyRow[]> {
  return db
    .select(listed)
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(desc(passkeys.createdAt), desc(passkeys.id));
}

/** Renames `userId`'s passkey `id`; undefined when they have no such passkey. */
export async function renamePasskey(
  db: Database,
  { userId, id, name }: { userId: string; id: string; name: string },
): Promise<PasskeyRow | undefined> {
  const [renamed] = await db
    .update(passkeys)
    .set({ name })
    .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
    .returning(listed);
  return renamed;
}

/** Removes `userId`'s passkey `id`, at once and for good. Answers whether there was one. */
export function removePasskey(
  db: Database,
  { userId, id }: { userId: string; id: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
      .returning({ id: passkeys.id });
    if (!removed) return false;
    await recordInLedger(tx, { type: "passkey.removed", userId, passkeyId: id });
    return true;
  });
}

/** Removes every passkey of `userId` in `tx`, as a recovery does (FR-11.5), recording it in the ledger. */
export async function removeAllPasskeys(tx: Transaction, userId: string): Promise<void> {
  await tx.delete(passkeys).where(eq(passkeys.userId, userId));
  await recordInLedger(tx, { type: "passkey.removed", userId, passkeyId: null });
}
