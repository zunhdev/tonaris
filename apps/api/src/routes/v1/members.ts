// Admin → Members (FR-11.5, FR-11.6, DS-100): the accounts, with their email, display name and join date only, and
// the creator's recovery of a member's sign-in email (TS-73). The creator judges ownership outside the app; the
// new address confirms with the emailed code and link (auth/recovery.ts). Creator-only and app-only (X-03).

import { Elysia } from "elysia";
import { z } from "zod";

import {
  cancelEmailRecovery,
  type Database,
  issueEmailRecovery,
  listMembers,
  type MemberRow,
} from "@tonaris/db";
import {
  emailKey,
  type EmailPort,
  emailRecoveryRefusalDetails as refusals,
  emailRecoveryStartSchema,
  type Member,
  memberSchema,
  problemSchema,
} from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { recoveryLink } from "../../auth/recovery";
import { newCode, newToken, sha256 } from "../../auth/secrets";
import { ProblemError } from "../../problem";
import { requireCreator } from "./admissions";

export type MemberAdminDeps = {
  db: Database;
  /** Sends the recovery's code and link (TS-72), with the web app's origin for the link. */
  email: EmailPort;
  webOrigin: string;
};

function listed(row: MemberRow): Member {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    joinedAt: row.joinedAt.toISOString(),
    recovery: row.recovery
      ? {
          newEmail: row.recovery.newEmailKey,
          requestedAt: row.recovery.requestedAt.toISOString(),
        }
      : null,
  };
}

const refused = (detail: string) => new ProblemError(422, "validation_failed", detail);
const memberParams = z.object({ id: z.uuid() });

export function memberAdminRoutes(
  session: SessionGuard,
  { db, email, webOrigin }: MemberAdminDeps,
) {
  return new Elysia()
    .use(session)
    .get(
      "/admin/members",
      {
        signedIn: true,
        response: {
          200: z.object({ members: z.array(memberSchema) }),
          401: problemSchema,
          403: problemSchema,
        },
        detail: {
          summary: "List members",
          description:
            "Every account, oldest first, with its email, display name and join date, and nothing of its collection. Creator only (FR-11.6).",
          tags: ["admission"],
          operationId: "listMembers",
        },
      },
      async ({ principal }) => {
        requireCreator(principal);
        return { members: (await listMembers(db)).map(listed) };
      },
    )
    .post(
      "/admin/members/:id/recovery",
      {
        signedIn: true,
        params: memberParams,
        body: emailRecoveryStartSchema,
        response: {
          200: memberSchema,
          401: problemSchema,
          403: problemSchema,
          404: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Recover a member's sign-in email",
          description:
            "Emails a code and link to the new address; confirming them there moves the account to it, ends its sessions, and records the reason. Replaces a recovery waiting for the member (FR-11.5, TS-73).",
          tags: ["admission"],
          operationId: "recoverMemberEmail",
        },
      },
      async ({ principal, account, params, body }) => {
        requireCreator(principal);
        const newEmail = emailKey(body.newEmail);
        if (!z.email().safeParse(newEmail).success) throw refused(refusals.notEmail);
        const reason = body.reason.trim();
        if (reason === "") throw refused(refusals.noReason);

        const token = newToken();
        const code = newCode();
        const issued = await issueEmailRecovery(db, {
          userId: params.id,
          newEmailKey: newEmail,
          tokenHash: sha256(token),
          codeHash: sha256(code),
          reason,
          disconnectConnections: body.disconnectConnections,
          requestedBy: account.id,
        });
        if (issued === "missing") throw new ProblemError(404, "not_found", refusals.none);
        if (issued !== "issued") throw refused(refusals[issued]);
        await email.send("recovery-verification", newEmail, {
          code,
          link: recoveryLink(webOrigin, token, code),
        });
        const member = (await listMembers(db)).find((row) => row.id === params.id);
        if (!member) throw new ProblemError(404, "not_found", refusals.none);
        return listed(member);
      },
    )
    .delete(
      "/admin/members/:id/recovery",
      {
        signedIn: true,
        params: memberParams,
        response: {
          // Elysia sends a 204 without a body, so validation sees undefined; the document shows no content.
          204: z.null().optional().meta({ description: "No recovery is waiting any more." }),
          401: problemSchema,
          403: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Cancel a member's recovery",
          description: "Its link stops working, and the member's email stays as it was.",
          tags: ["admission"],
          operationId: "cancelMemberRecovery",
        },
      },
      async ({ principal, params, status }) => {
        requireCreator(principal);
        await cancelEmailRecovery(db, params.id);
        return status(204, null);
      },
    );
}
