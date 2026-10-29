// The approval page's API (DS-87, TS-64): an MCP connection's gated request, for its owner only, and the
// owner's decision; and the requests waiting for a decision, for Settings and the app's badge (DS-86). App-only like the
// rest of /v1: MCP tokens never reach it (TS-62).

import { Elysia } from "elysia";
import { z } from "zod";

import {
  type ApprovalRow,
  type Database,
  decideApproval,
  findApproval,
  pendingApprovals,
} from "@tonaris/db";
import {
  approvalConsequences,
  approvalDecisionSchema,
  approvalSchema,
  pendingApprovalsSchema,
  approvalState,
  approvalSummary,
  problemSchema,
  type Approval,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

function view(approval: ApprovalRow): Approval {
  return {
    id: approval.id,
    state: approvalState(approval),
    clientName: approval.clientName,
    summary: approvalSummary(approval.scope),
    consequences: approvalConsequences(approval.scope),
    scope: approval.scope,
    expiresAt: approval.expiresAt.toISOString(),
    decidedAt: approval.decidedAt?.toISOString() ?? null,
  };
}

/** The approval, if it is `accountId`'s; another account's is refused, not hidden (DS-87). */
async function ownApproval(db: Database, id: string, accountId: string): Promise<ApprovalRow> {
  const approval = await findApproval(db, id);
  if (!approval) throw new ProblemError(404, "not_found", "There is no such request.");
  if (approval.accountId !== accountId) {
    throw new ProblemError(403, "permission_denied", "This request belongs to another account.");
  }
  return approval;
}

const params = z.object({ id: z.uuid() });

export function approvalRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .get(
      "/approvals",
      {
        signedIn: true,
        response: { 200: pendingApprovalsSchema, 401: problemSchema },
        detail: {
          summary: "List approval requests waiting for a decision",
          description:
            "The gated operations AI clients asked for that the owner hasn't decided yet and that haven't expired, oldest first (DS-86).",
          tags: ["approvals"],
          operationId: "listPendingApprovals",
        },
      },
      async ({ account }) => ({
        approvals: (await pendingApprovals(db, account.id)).map((approval) => ({
          id: approval.id,
          clientName: approval.clientName,
          summary: approvalSummary(approval.scope),
          expiresAt: approval.expiresAt.toISOString(),
        })),
      }),
    )
    .get(
      "/approvals/:id",
      {
        signedIn: true,
        params,
        response: {
          200: approvalSchema,
          401: problemSchema,
          403: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Get an approval request",
          description:
            "A gated operation an AI client asked for (TS-64): its scope in Tonaris's words, and its state.",
          tags: ["approvals"],
          operationId: "getApproval",
        },
      },
      async ({ params: { id }, account }) => view(await ownApproval(db, id, account.id)),
    )
    .post(
      "/approvals/:id/decision",
      {
        signedIn: true,
        params,
        body: approvalDecisionSchema,
        response: {
          200: approvalSchema,
          401: problemSchema,
          403: problemSchema,
          404: problemSchema,
          410: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Approve or decline a request",
          description:
            "Records the owner's decision while the request is pending. A request already decided or used keeps its state and is returned as it is; an expired one can't be decided.",
          tags: ["approvals"],
          operationId: "decideApproval",
        },
      },
      async ({ params: { id }, body, account }) => {
        const approval = await ownApproval(db, id, account.id);
        if (approvalState(approval) === "expired") {
          throw new ProblemError(410, "expired", "This request has expired; nothing happened.");
        }
        await decideApproval(db, { accountId: account.id, id, decision: body.decision });
        return view(await ownApproval(db, id, account.id));
      },
    );
}
