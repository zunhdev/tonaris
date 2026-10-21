// Approvals storage (TS-64): created by a gated MCP tool, decided by the owner on the approval page, and used
// once by the operation they approve (`trashAlbums` in mcp.ts).

import { and, eq, gt } from "drizzle-orm";

import type { ApprovalOperation, ApprovalScope } from "@tonaris/domain";

import type { Database } from "./client";
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
