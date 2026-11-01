// Approvals storage (TS-64): created by a gated MCP tool, decided by the owner on the approval page, and used
// once, by the batch that runs the operation they approved, in that batch's own transaction.

import { and, asc, eq, gt, or } from "drizzle-orm";

import { approvalState, type ApprovalOperation, type ApprovalScope } from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import { approvals, oauthClients, oauthConsents } from "./schema";

export type ApprovalRow = typeof approvals.$inferSelect & {
  /** The client of the connection that asked, as it named itself. */
  clientName: string | null;
};

export async function createApproval(
  db: Database,
  values: {
    id: string;
    accountId: string;
    grantId: string;
    operation: ApprovalOperation;
    args: Record<string, unknown>;
    scope: ApprovalScope;
    scopeHash: string;
    expiresAt: Date;
  },
): Promise<void> {
  await db.insert(approvals).values(values);
}

export async function findApproval(db: Database, id: string): Promise<ApprovalRow | undefined> {
  const [row] = await db
    .select({ approval: approvals, clientName: oauthClients.name })
    .from(approvals)
    .innerJoin(oauthConsents, eq(oauthConsents.id, approvals.grantId))
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
    .where(eq(approvals.id, id));
  return row && { ...row.approval, clientName: row.clientName };
}

/**
 * Records the owner's decision on their pending, unexpired approval. Returns whether it was recorded; an
 * approval already decided, used or expired keeps its state.
 */
export async function decideApproval(
  db: Database,
  {
    accountId,
    id,
    decision,
    now = new Date(),
  }: { accountId: string; id: string; decision: "approve" | "decline"; now?: Date },
): Promise<boolean> {
  const decided = await db
    .update(approvals)
    .set({ status: decision === "approve" ? "approved" : "declined", decidedAt: now })
    .where(
      and(
        eq(approvals.id, id),
        eq(approvals.accountId, accountId),
        eq(approvals.status, "pending"),
        gt(approvals.expiresAt, now),
      ),
    )
    .returning({ id: approvals.id });
  return decided.length > 0;
}

/** What using an approval found: used now (or already, by this batch), a scope that changed, or nothing usable. */
export type ApprovalUse = "used" | "scope_changed" | "not_usable";

/**
 * Uses the approval for `batchId` (TS-64), in the transaction that runs the operation, after it took the owner's lock
 * and computed the scope again. It is used only if it is this connection's, approved, unexpired and still hashes as
 * `scopeHash`; or if `batchId` already used it, so sending that batch's key again replays it.
 */
export async function useApproval(
  tx: Transaction,
  {
    id,
    grantId,
    scopeHash,
    batchId,
    now = new Date(),
  }: { id: string; grantId: string; scopeHash: string; batchId: string; now?: Date },
): Promise<ApprovalUse> {
  const used = await tx
    .update(approvals)
    .set({ status: "used", usedAt: now, batchId })
    .where(
      and(
        eq(approvals.id, id),
        eq(approvals.grantId, grantId),
        or(
          and(
            eq(approvals.status, "approved"),
            gt(approvals.expiresAt, now),
            eq(approvals.scopeHash, scopeHash),
          ),
          and(eq(approvals.status, "used"), eq(approvals.batchId, batchId)),
        ),
      ),
    )
    .returning({ id: approvals.id });
  if (used.length > 0) return "used";
  const [approval] = await tx
    .select({ status: approvals.status, expiresAt: approvals.expiresAt })
    .from(approvals)
    .where(and(eq(approvals.id, id), eq(approvals.grantId, grantId)));
  return approval && approvalState(approval, now) === "approved" ? "scope_changed" : "not_usable";
}

/** The account's approvals waiting for a decision, oldest first, for Settings and the app's badge (DS-86). */
export async function pendingApprovals(
  db: Database,
  accountId: string,
  now: Date = new Date(),
): Promise<ApprovalRow[]> {
  const rows = await db
    .select({ approval: approvals, clientName: oauthClients.name })
    .from(approvals)
    .innerJoin(oauthConsents, eq(oauthConsents.id, approvals.grantId))
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
    .where(
      and(
        eq(approvals.accountId, accountId),
        eq(approvals.status, "pending"),
        gt(approvals.expiresAt, now),
      ),
    )
    .orderBy(asc(approvals.createdAt), asc(approvals.id));
  return rows.map((row) => Object.assign(row.approval, { clientName: row.clientName }));
}
