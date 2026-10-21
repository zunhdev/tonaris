// The approval round trip of a gated tool (TS-64), for `delete_albums`: without an approval, the tool stores the
// exact scope and asks for the owner's decision; with one, it runs only if the owner approved this connection's
// request, the approval is unused and unexpired, and the scope computed again still hashes the same.

import {
  albumDeletionTargets,
  createApproval,
  type Database,
  findApproval,
  trashAlbums,
} from "@tonaris/db";
import {
  albumDeletionScope,
  approvalConsequences,
  approvalState,
  approvalSummary,
  approvalValidMinutes,
  scopeHash,
  uuidv7,
  type AlbumDeletionScope,
  type ApprovalState,
  type McpPrincipal,
} from "@tonaris/domain";

/** What `delete_albums` answers. Every field is data for the agent to act on or relay (TS-65). */
export type DeletionResult =
  | {
      status: "needs_approval";
      approvalId: string;
      url: string;
      summary: string;
      consequences: string[];
      expiresAt: string;
      /** Why a new approval is asked for, or that the earlier one is still undecided. */
      note?: string;
      unavailable: string[];
    }
  | { status: "confirmed"; trashed: string[]; unavailable: string[] }
  | { status: "declined" }
  | { status: "failed"; code: "not_found" | "expired" | "validation_failed"; detail: string };

export type ApprovalContext = {
  db: Database;
  principal: McpPrincipal;
  /** Where the approval page is: `${webOrigin}/approvals/{id}` (DS-87). */
  webOrigin: string;
  now?: () => Date;
};

async function askForApproval(
  { db, principal, webOrigin, now = () => new Date() }: ApprovalContext,
  albumIds: string[],
  scope: AlbumDeletionScope,
  unavailable: string[],
  note?: string,
): Promise<DeletionResult> {
  const id = uuidv7();
  const expiresAt = new Date(now().getTime() + approvalValidMinutes * 60_000);
  await createApproval(db, {
    id,
    accountId: principal.userId,
    grantId: principal.grantId,
    operation: "delete_albums",
    args: { albumIds },
    scope,
    scopeHash: await scopeHash(scope),
    expiresAt,
  });
  return {
    status: "needs_approval",
    approvalId: id,
    url: `${webOrigin}/approvals/${id}`,
    summary: approvalSummary(scope),
    consequences: approvalConsequences(scope),
    expiresAt: expiresAt.toISOString(),
    ...(note ? { note } : {}),
    unavailable,
  };
}

/** `delete_albums`: albums to Trash (FR-14.1), gated by the owner's approval (FR-10.6). */
export async function deleteAlbums(
  context: ApprovalContext,
  { albumIds, approvalId }: { albumIds: string[]; approvalId?: string },
): Promise<DeletionResult> {
  const { db, principal, now = () => new Date() } = context;
  const targets = await albumDeletionTargets(db, { ownerId: principal.userId, albumIds });
  const found = new Set(targets.map((album) => album.id));
  const unavailable = albumIds.filter((id) => !found.has(id));
  if (targets.length === 0) {
    return {
      status: "failed",
      code: "not_found",
      detail: "None of these albums is in the collection; they may already be in Trash.",
    };
  }
  const scope = albumDeletionScope(targets);
  if (!approvalId) return askForApproval(context, albumIds, scope, unavailable);

  const approval = await findApproval(db, approvalId);
  if (!approval || approval.grantId !== principal.grantId) {
    return {
      status: "failed",
      code: "not_found",
      detail: "There is no approval with this ID for this connection.",
    };
  }
  const state: ApprovalState = approvalState(approval, now());
  if (state === "declined") return { status: "declined" };
  if (state === "used") {
    return { status: "failed", code: "expired", detail: "This approval was already used." };
  }
  if (state === "expired") {
    return askForApproval(context, albumIds, scope, unavailable, "The earlier approval expired.");
  }
  if (state === "pending") {
    return {
      status: "needs_approval",
      approvalId: approval.id,
      url: `${context.webOrigin}/approvals/${approval.id}`,
      summary: approvalSummary(approval.scope),
      consequences: approvalConsequences(approval.scope),
      expiresAt: approval.expiresAt.toISOString(),
      note: "The owner hasn't decided yet.",
      unavailable,
    };
  }

  const result = await trashAlbums(db, {
    ownerId: principal.userId,
    grantId: principal.grantId,
    approvalId: approval.id,
    albumIds,
    now: now(),
  });
  if (result.status === "trashed") {
    return { status: "confirmed", trashed: result.albumIds, unavailable };
  }
  if (result.status === "scope_changed") {
    return askForApproval(
      context,
      albumIds,
      result.scope,
      unavailable,
      "What this deletes changed since it was approved, so it needs a new approval.",
    );
  }
  return {
    status: "failed",
    code: "expired",
    detail: "This approval can't be used any more. Ask again without approvalId.",
  };
}
