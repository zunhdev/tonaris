// Admin → Admissions (FR-11.6, DS-100, TS-71): the creator issues, lists, resends and revokes admission
// invitations, and pauses or resumes admissions. Creator-only and app-only (X-03): the routes take the session
// cookie, MCP tokens never reach /v1 (TS-62), and every handler asks the admission policy first.

import { Elysia } from "elysia";
import { z } from "zod";

import {
  admissionsPaused,
  type AdmissionInvitationRow,
  type Database,
  findAdmissionInvitationById,
  listAdmissionInvitations,
  recordAdmissionEmail,
  revokeAdmissionInvitation,
  rotateAdmissionToken,
  setAdmissionsPaused,
} from "@tonaris/db";
import {
  admissionAdminRefusalDetails,
  type AdmissionInvitation,
  admissionInvitationSchema,
  admissionInviteSchema,
  admissionsPausedSchema,
  admissionsSchema,
  authorizeAdmissionAdmin,
  emailKey,
  type EmailPort,
  invitationStatus,
  type Principal,
  problemSchema,
} from "@tonaris/domain";

import {
  admissionTokenHash,
  invitationLink,
  issueAdmissionInvitation,
  newAdmissionToken,
} from "../../auth/admission";
import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

export type AdmissionAdminDeps = {
  db: Database;
  /** Sends invitations (TS-72), with the web app's origin for their links. */
  email: EmailPort;
  webOrigin: string;
  logError: (error: unknown, context: string) => void;
};

/** An invitation as the admin lists it, with the status that holds now. */
function listed(row: AdmissionInvitationRow, now = new Date()): AdmissionInvitation {
  return {
    id: row.id,
    email: row.emailKey,
    status: invitationStatus(row, now),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    redeemedAt: row.redeemedAt?.toISOString() ?? null,
    emailStatus: row.emailStatus,
  };
}

/** Admission administration is the creator's, in the app only (FR-11.6, X-03). */
export function requireCreator(principal: Principal): void {
  if (!authorizeAdmissionAdmin(principal).allowed) {
    throw new ProblemError(403, "permission_denied", "Only the creator administers admissions.");
  }
}

const invitationParams = z.object({ id: z.uuid() });
/** An action's body: no fields, since a POST must be JSON (TS-102). */
const noFields = z.object({}).meta({ description: "No fields." });
const refusals = { 401: problemSchema, 403: problemSchema, 404: problemSchema, 422: problemSchema };

export function admissionAdminRoutes(
  session: SessionGuard,
  { db, email, webOrigin, logError }: AdmissionAdminDeps,
) {
  /**
   * Queues the invitation's email, whose job records how it went (TS-72). If it can't even be queued, it is
   * recorded as failed, so the row offers Resend rather than sending for good.
   */
  async function emailInvitation(id: string, address: string, token: string): Promise<void> {
    try {
      await email.send(
        "admission-invitation",
        address,
        { link: invitationLink(webOrigin, token) },
        { outcome: { kind: "admission_invitation", id } },
      );
    } catch (error) {
      logError(error, "admission invitation email");
      await recordAdmissionEmail(db, id, "failed");
    }
  }

  /** The invitation, re-read after an action, or the refusal for one that exists but wasn't usable. */
  async function afterAction(
    id: string,
    acted: AdmissionInvitationRow | undefined,
    unavailable: string,
  ): Promise<AdmissionInvitation> {
    const row = await findAdmissionInvitationById(db, id);
    if (!row) throw new ProblemError(404, "not_found", "No invitation with this ID.");
    if (!acted) throw new ProblemError(422, "validation_failed", unavailable);
    return listed(row);
  }

  return new Elysia()
    .use(session)
    .get(
      "/admin/admissions",
      {
        signedIn: true,
        response: { 200: admissionsSchema, 401: problemSchema, 403: problemSchema },
        detail: {
          summary: "List admission invitations",
          description:
            "Whether admissions are paused, and every invitation, newest first. Creator only (FR-11.6).",
          tags: ["admission"],
          operationId: "listAdmissions",
        },
      },
      async ({ principal }) => {
        requireCreator(principal);
        const [paused, rows] = await Promise.all([
          admissionsPaused(db),
          listAdmissionInvitations(db),
        ]);
        const now = new Date();
        return { paused, invitations: rows.map((row) => listed(row, now)) };
      },
    )
    .post(
      "/admin/admissions/invitations",
      {
        signedIn: true,
        body: admissionInviteSchema,
        response: { 201: admissionInvitationSchema, ...refusals },
        detail: {
          summary: "Invite someone to join",
          description:
            "Issues an invitation bound to this address, single-use and valid for 14 days, and emails it. Refused for an address that has an account or an available invitation (FR-11.6).",
          tags: ["admission"],
          operationId: "createAdmissionInvitation",
        },
      },
      async ({ principal, account, body, status }) => {
        requireCreator(principal);
        const address = emailKey(body.email);
        if (!z.email().safeParse(address).success) {
          throw new ProblemError(422, "validation_failed", admissionAdminRefusalDetails.notEmail);
        }
        const issued = await issueAdmissionInvitation(db, {
          email: address,
          createdBy: account.id,
          emailed: true,
        });
        if (!issued.issued) {
          throw new ProblemError(
            422,
            "validation_failed",
            admissionAdminRefusalDetails[issued.refusal](address),
          );
        }
        await emailInvitation(issued.id, address, issued.token);
        const row = await findAdmissionInvitationById(db, issued.id);
        if (!row) throw new Error("The invitation just issued is gone.");
        return status(201, listed(row));
      },
    )
    .post(
      "/admin/admissions/invitations/:id/resend",
      {
        signedIn: true,
        params: invitationParams,
        body: noFields,
        response: { 200: admissionInvitationSchema, ...refusals },
        detail: {
          summary: "Send an invitation again",
          description:
            "Emails an available invitation again with a new link; the earlier link stops working, and the expiry stays (FR-11.6).",
          tags: ["admission"],
          operationId: "resendAdmissionInvitation",
        },
      },
      async ({ principal, params }) => {
        requireCreator(principal);
        const token = newAdmissionToken();
        const rotated = await rotateAdmissionToken(db, params.id, {
          tokenHash: admissionTokenHash(token),
        });
        if (rotated) await emailInvitation(rotated.id, rotated.emailKey, token);
        return afterAction(params.id, rotated, admissionAdminRefusalDetails.resendUnavailable);
      },
    )
    .post(
      "/admin/admissions/invitations/:id/revoke",
      {
        signedIn: true,
        params: invitationParams,
        body: noFields,
        response: { 200: admissionInvitationSchema, ...refusals },
        detail: {
          summary: "Revoke an invitation",
          description:
            "An available invitation can no longer be used. Accounts that invitations admitted are never touched (FR-11.6).",
          tags: ["admission"],
          operationId: "revokeAdmissionInvitation",
        },
      },
      async ({ principal, params }) => {
        requireCreator(principal);
        const revoked = await revokeAdmissionInvitation(db, params.id);
        return afterAction(params.id, revoked, admissionAdminRefusalDetails.revokeUnavailable);
      },
    )
    .put(
      "/admin/admissions/paused",
      {
        signedIn: true,
        body: admissionsPausedSchema,
        response: {
          200: admissionsPausedSchema,
          401: problemSchema,
          403: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Pause or resume admissions",
          description:
            "While paused, no account is created. Members keep their access, and invitations stay as they are (FR-11.2, FR-11.6).",
          tags: ["admission"],
          operationId: "setAdmissionsPaused",
        },
      },
      async ({ principal, body }) => {
        requireCreator(principal);
        await setAdmissionsPaused(db, body.paused);
        return { paused: body.paused };
      },
    );
}
