// The approval round trip of a gated tool (TS-64, FR-10.6), for every gated operation. Without an approval, the tool
// stores the exact scope of what it would do and asks for the owner's decision on Tonaris's page. With one, the
// operation runs only if the owner approved this connection's request, the approval is unused and unexpired, and the
// scope computed again, under the owner's lock, still hashes the same: then the approval is used in the transaction
// that makes the change. An agent's claim that the owner approved is never enough.

import { createApproval, findApproval, type Database, type Transaction } from "@tonaris/db";
import {
  approvalConsequences,
  approvalState,
  approvalSummary,
  approvalValidMinutes,
  scopeHash,
  uuidv7,
  type ApprovalOperation,
  type ApprovalScope,
  type McpPrincipal,
} from "@tonaris/domain";

import type { McpWriter, PlanIds, PlannedItem, WriteResult } from "./writes";

/** What a gated tool answers. Every field is data for the agent to act on or relay (TS-65). */
export type GatedAnswer =
  | {
      status: "needs_approval";
      approvalId: string;
      url: string;
      summary: string;
      consequences: string[];
      expiresAt: string;
      /** Why a new approval is asked for, or that the earlier one is still undecided. */
      note?: string;
    }
  | { status: "declined" }
  | { status: "failed"; code: "not_found" | "expired" | "validation_failed"; message: string }
  | Extract<WriteResult, { status: "ran" }>;

export type GatedContext = {
  db: Database;
  principal: McpPrincipal;
  writer: McpWriter;
  /** Where the approval page is: `${webOrigin}/approvals/{id}` (DS-87). */
  webOrigin: string;
  now?: () => Date;
};

export type GatedRequest = {
  tool: string;
  operation: ApprovalOperation;
  args: Record<string, unknown> & {
    approvalId?: string | undefined;
    idempotencyKey?: string | undefined;
  };
  /** The scope now, read in `tx`; undefined when there is nothing of the owner's to act on. */
  scope: (tx: Transaction) => Promise<ApprovalScope | undefined>;
  /** The envelopes that carry out the approved scope. */
  plan: (ids: PlanIds, approved: ApprovalScope) => PlannedItem[];
  /** For a capture, which asks its providers before it takes the lock. */
  outsideLock?: boolean;
  /** Says what nothing to act on means, such as "None of these is in the collection". */
  missing: string;
};

async function ask(
  { db, principal, webOrigin, now = () => new Date() }: GatedContext,
  { operation, args }: Pick<GatedRequest, "operation" | "args">,
  scope: ApprovalScope,
  note?: string,
): Promise<GatedAnswer> {
  const id = uuidv7();
  const expiresAt = new Date(now().getTime() + approvalValidMinutes * 60_000);
  const { approvalId: _, idempotencyKey: __, ...asked } = args;
  await createApproval(db, {
    id,
    accountId: principal.userId,
    grantId: principal.grantId,
    operation,
    args: asked,
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
  };
}

/** Asks for the owner's approval of `request`, or runs it under the approval it names (TS-64). */
export async function gated(context: GatedContext, request: GatedRequest): Promise<GatedAnswer> {
  const { db, principal, writer, now = () => new Date() } = context;
  const { approvalId } = request.args;
  if (!approvalId) {
    const scope = await db.transaction((tx) => request.scope(tx), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    if (!scope) return { status: "failed", code: "not_found", message: request.missing };
    return ask(context, request, scope);
  }

  const approval = await findApproval(db, approvalId);
  if (
    !approval ||
    approval.grantId !== principal.grantId ||
    approval.operation !== request.operation
  ) {
    return {
      status: "failed",
      code: "not_found",
      message: "There is no such approval for this connection and change.",
    };
  }
  const state = approvalState(approval, now());
  if (state === "declined") return { status: "declined" };
  if (state === "pending") {
    return {
      status: "needs_approval",
      approvalId: approval.id,
      url: `${context.webOrigin}/approvals/${approval.id}`,
      summary: approvalSummary(approval.scope),
      consequences: approvalConsequences(approval.scope),
      expiresAt: approval.expiresAt.toISOString(),
      note: "The owner hasn't decided yet.",
    };
  }
  if (state === "expired") {
    const scope = await db.transaction((tx) => request.scope(tx));
    if (!scope) return { status: "failed", code: "not_found", message: request.missing };
    return ask(context, request, scope, "The earlier approval expired.");
  }

  // Approved, or used: a batch that used it may send its key again and replay.
  const written = await writer.writeApproved(principal, {
    tool: request.tool,
    args: request.args,
    idempotencyKey: request.args.idempotencyKey,
    approvalId: approval.id,
    scope: request.scope,
    plan: (ids) => request.plan(ids, approval.scope),
    ...(request.outsideLock ? { outsideLock: true } : {}),
  });
  if (written.status === "ran") return written;
  if (written.status === "key_reused") {
    return {
      status: "failed",
      code: "validation_failed",
      message:
        "This idempotencyKey was already used for a different change, so nothing was done. Use a new key.",
    };
  }
  if (written.status === "scope_changed") {
    if (!written.scope) return { status: "failed", code: "not_found", message: request.missing };
    return ask(
      context,
      request,
      written.scope,
      "What this does changed since it was approved, so it needs a new approval.",
    );
  }
  return {
    status: "failed",
    code: "expired",
    message: "This approval was already used. Ask again without approvalId for a new change.",
  };
}
