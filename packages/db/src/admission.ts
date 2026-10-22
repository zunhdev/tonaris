// Admission storage (TS-71): the creator's invitations, the pause switch, and admitting an invited person. The
// admin around them (issuing, revoking, statuses, email delivery) arrives with TON-74.

import { and, eq } from "drizzle-orm";

import { invitationStatus, type AdmissionRefusal } from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import { admissionInvitations, serviceState, users } from "./schema";

export type AdmissionInvitationRow = typeof admissionInvitations.$inferSelect;

export async function insertAdmissionInvitation(
  db: Database,
  values: { id: string; emailKey: string; tokenHash: Buffer; expiresAt: Date; createdBy: string },
): Promise<void> {
  await db.insert(admissionInvitations).values(values);
}

export async function findAdmissionInvitation(
  db: Database,
  tokenHash: Buffer,
): Promise<AdmissionInvitationRow | undefined> {
  const [invitation] = await db
    .select()
    .from(admissionInvitations)
    .where(eq(admissionInvitations.tokenHash, tokenHash));
  return invitation;
}

/** Revokes an available invitation; returns whether it was available. Admitted accounts are untouched. */
export async function revokeAdmissionInvitation(db: Database, id: string): Promise<boolean> {
  const revoked = await db
    .update(admissionInvitations)
    .set({ status: "revoked" })
    .where(and(eq(admissionInvitations.id, id), eq(admissionInvitations.status, "available")))
    .returning({ id: admissionInvitations.id });
  return revoked.length > 0;
}

export async function admissionsPaused(db: Database): Promise<boolean> {
  const [state] = await db
    .select({ paused: serviceState.admissionsPaused })
    .from(serviceState)
    .where(eq(serviceState.id, 1));
  return state?.paused ?? false;
}

/** Pauses or resumes admissions. It waits for admissions in flight, which lock the row for share. */
export async function setAdmissionsPaused(db: Database, paused: boolean): Promise<void> {
  await db.update(serviceState).set({ admissionsPaused: paused }).where(eq(serviceState.id, 1));
}

/** Admission refused, or an account that already has the address (whose owner signs in instead). */
export type Admission =
  | { admitted: true; userId: string; emailKey: string }
  | { admitted: false; refusal: AdmissionRefusal | "registered" };

/**
 * Admits the person invited by `invitationId` on the caller's transaction (TS-71), so the caller can open their
 * session in it too: creates their account and redeems the invitation, or refuses and changes nothing.
 *
 * The locks make it safe against every concurrent change. The service state is locked for share, so a pause waits
 * for admissions in flight, and an admission after a pause sees it. The invitation is locked for update, so of
 * two registrations, revocations or re-issues of it, the second sees what the first did.
 */
export async function admitAccount(
  tx: Transaction,
  { invitationId, userId, now = new Date() }: { invitationId: string; userId: string; now?: Date },
): Promise<Admission> {
  const [state] = await tx
    .select({ paused: serviceState.admissionsPaused })
    .from(serviceState)
    .where(eq(serviceState.id, 1))
    .for("share");
  if (state?.paused) return { admitted: false, refusal: "paused" };

  const [invitation] = await tx
    .select()
    .from(admissionInvitations)
    .where(eq(admissionInvitations.id, invitationId))
    .for("update");
  if (!invitation) return { admitted: false, refusal: "invalid" };
  const status = invitationStatus(invitation, now);
  if (status !== "available") return { admitted: false, refusal: status };

  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.emailKey));
  if (existing) return { admitted: false, refusal: "registered" };

  // Verified: the caller checked the code sent to this address. The display name stays unset (FR-11.3).
  await tx.insert(users).values({ id: userId, email: invitation.emailKey, emailVerified: true });
  await tx
    .update(admissionInvitations)
    .set({ status: "redeemed", redeemedBy: userId, redeemedAt: now })
    .where(eq(admissionInvitations.id, invitation.id));
  return { admitted: true, userId, emailKey: invitation.emailKey };
}
