// Account deletion's storage (FR-11.10, FR-11.11, TS-74). Confirming is one transaction that stops everything at
// once: the address moves to a placeholder, so it signs in to nothing; sessions and AI connections end; the
// account's links and invitations are revoked, and its own invitations as a viewer withdrawn; the audit log
// records it; and the data job is queued. The job then removes the owned rows in chunks, and the account last.

import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { accountDeletionJobKind, type AccountDeletionStatus } from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import { enqueueJob } from "./jobs";
import {
  accountDeletions,
  accountSettings,
  accountSync,
  albums,
  approvals,
  auditLog,
  changeLog,
  containers,
  fieldDefinitions,
  memberships,
  mutations,
  oauthAccessTokens,
  oauthConsents,
  oauthRefreshTokens,
  positions,
  savedReferences,
  sessions,
  shareGrants,
  shareLinks,
  trashUnits,
  users,
  viewPrefs,
} from "./schema";

/** The address a deleted account holds until its row goes: under `.invalid`, which never receives email. */
export const deletedEmailKey = (userId: string) => `${userId}@deleted.invalid`;

/** How long a finished deletion's progress is kept for its page (TS-74). */
export const finishedDeletionRetentionMs = 7 * 24 * 60 * 60_000;

/** Albums removed per transaction, so a large collection never holds one long transaction. */
export const deletionChunkSize = 500;

/**
 * Starts deleting `userId` (TS-74), in one transaction. Refused for an unknown account, the creator, and one
 * already being deleted; otherwise answers "started", with the job queued on the same transaction.
 */
export async function beginAccountDeletion(
  db: Database,
  {
    userId,
    deletionId,
    tokenHash,
    auditId,
    now = new Date(),
  }: { userId: string; deletionId: string; tokenHash: Buffer; auditId: string; now?: Date },
): Promise<"started" | "missing" | "creator" | "deleting"> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ role: users.role, deletingAt: users.deletingAt })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!account) return "missing";
    if (account.role === "creator") return "creator";
    if (account.deletingAt) return "deleting";

    await tx
      .update(users)
      .set({ email: deletedEmailKey(userId), deletingAt: now })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(oauthAccessTokens).where(eq(oauthAccessTokens.userId, userId));
    await tx.delete(oauthRefreshTokens).where(eq(oauthRefreshTokens.userId, userId));
    await tx.delete(oauthConsents).where(eq(oauthConsents.userId, userId));

    const owned = tx
      .select({ id: containers.id })
      .from(containers)
      .where(eq(containers.ownerId, userId));
    await tx
      .update(shareLinks)
      .set({ revokedAt: now })
      .where(and(inArray(shareLinks.containerId, owned), isNull(shareLinks.revokedAt)));
    const open = inArray(shareGrants.status, ["pending", "accepted"]);
    await tx
      .update(shareGrants)
      .set({ status: "revoked" })
      .where(and(inArray(shareGrants.containerId, owned), open));
    await tx
      .update(shareGrants)
      .set({ status: "withdrawn" })
      .where(and(eq(shareGrants.granteeId, userId), open));

    // No address or name stays behind in the log (FR-11.11).
    await tx.insert(auditLog).values({
      id: auditId,
      actor: userId,
      action: "account.delete",
      subject: userId,
      details: {},
      at: now,
    });
    await tx
      .insert(accountDeletions)
      .values({ id: deletionId, userId, tokenHash, status: "deleting" });
    await enqueueJob(tx, {
      id: deletionId,
      kind: accountDeletionJobKind,
      payload: { deletionId, userId },
      runAt: now,
    });
    return "started";
  });
}

/**
 * Removes one chunk of `userId`'s albums, with their memberships, provenance, links and field values. Answers
 * whether any were left to remove.
 */
async function deleteAlbumChunk(db: Database, userId: string): Promise<boolean> {
  const chunk = db
    .select({ id: albums.id })
    .from(albums)
    .where(eq(albums.ownerId, userId))
    .limit(deletionChunkSize);
  const deleted = await db
    .delete(albums)
    .where(inArray(albums.id, chunk))
    .returning({ id: albums.id });
  return deleted.length > 0;
}

/** Everything else the account owns, and the account itself, which cascades its sessions and OAuth rows. */
async function deleteTheRest(tx: Transaction, userId: string): Promise<void> {
  await tx.delete(memberships).where(eq(memberships.ownerId, userId));
  // One statement: `parent_id` has no foreign key, and links, grants and references cascade with containers.
  await tx.delete(containers).where(eq(containers.ownerId, userId));
  await tx.delete(trashUnits).where(eq(trashUnits.ownerId, userId));
  await tx.delete(fieldDefinitions).where(eq(fieldDefinitions.ownerId, userId));
  await tx.delete(shareGrants).where(eq(shareGrants.granteeId, userId));
  await tx.delete(savedReferences).where(eq(savedReferences.viewerId, userId));
  await tx.delete(viewPrefs).where(eq(viewPrefs.personId, userId));
  await tx.delete(positions).where(eq(positions.personId, userId));
  await tx.delete(accountSettings).where(eq(accountSettings.accountId, userId));
  await tx.delete(approvals).where(eq(approvals.accountId, userId));
  await tx.delete(mutations).where(eq(mutations.accountId, userId));
  await tx.delete(changeLog).where(eq(changeLog.accountId, userId));
  await tx.delete(accountSync).where(eq(accountSync.accountId, userId));
  await tx.delete(users).where(eq(users.id, userId));
}

/**
 * The deletion job's work (TS-74): the albums in chunks, each its own transaction, then everything else and the
 * account in one. Running it again after a failure removes whatever is left.
 */
export async function deleteAccountData(db: Database, userId: string): Promise<void> {
  // One chunk after another, each its own transaction, until none is left.
  // oxlint-disable-next-line no-await-in-loop
  while (await deleteAlbumChunk(db, userId));
  await db.transaction((tx) => deleteTheRest(tx, userId));
}

/** Records how the deletion ended: deleted, or failed and waiting for a retry. */
export async function finishAccountDeletion(
  db: Database,
  deletionId: string,
  status: Exclude<AccountDeletionStatus, "deleting">,
  now = new Date(),
): Promise<void> {
  await db
    .update(accountDeletions)
    .set({ status, finishedAt: now })
    .where(eq(accountDeletions.id, deletionId));
}

export type AccountDeletionRow = typeof accountDeletions.$inferSelect;

export async function findAccountDeletion(
  db: Database,
  tokenHash: Buffer,
): Promise<AccountDeletionRow | undefined> {
  const [deletion] = await db
    .select()
    .from(accountDeletions)
    .where(eq(accountDeletions.tokenHash, tokenHash));
  return deletion;
}

/** Queues a failed deletion again (DS-97's Retry). Answers its status afterwards, or undefined if unknown. */
export async function retryAccountDeletion(
  db: Database,
  tokenHash: Buffer,
  { jobId, now = new Date() }: { jobId: string; now?: Date },
): Promise<AccountDeletionStatus | undefined> {
  return db.transaction(async (tx) => {
    const [deletion] = await tx
      .select()
      .from(accountDeletions)
      .where(eq(accountDeletions.tokenHash, tokenHash))
      .for("update");
    if (!deletion) return undefined;
    if (deletion.status !== "failed") return deletion.status;
    await tx
      .update(accountDeletions)
      .set({ status: "deleting", finishedAt: null })
      .where(eq(accountDeletions.id, deletion.id));
    await enqueueJob(tx, {
      id: jobId,
      kind: accountDeletionJobKind,
      payload: { deletionId: deletion.id, userId: deletion.userId },
      runAt: now,
    });
    return "deleting";
  });
}

/** Finished deletions older than a week: the daily prune (TS-91). */
export async function pruneAccountDeletions(db: Database | Transaction, now: Date): Promise<void> {
  const before = new Date(now.getTime() - finishedDeletionRetentionMs);
  // Only a finished deletion has `finished_at`.
  await db.delete(accountDeletions).where(lt(accountDeletions.finishedAt, before));
}
