// Admission storage (TS-71): the creator's invitations and their administration (FR-11.6, TON-74), the pause
// switch, and admitting an invited person.

import { and, desc, eq, gt, lte } from "drizzle-orm";

import { invitationStatus, type AdmissionRefusal, type EmailStatus } from "@tonaris/domain";

import type { Database, Executor, Transaction } from "./client";
import { recordInLedger } from "./ledger";
import { admissionInvitations, serviceState, users } from "./schema";

export type AdmissionInvitationRow = typeof admissionInvitations.$inferSelect;

/** What issuing gave: the invitation, or a refusal for an address with an account or an available invitation. */
export type AdmissionIssue = "issued" | "registered" | "invited";

/**
 * Issues an invitation, in one transaction (FR-11.6). An address with an account is refused. So is one with an
 * available invitation: the partial unique index lets only one exist, so of two at once, one is refused too. An
 * invitation past its expiry still holds the index until the daily job records it, so it is marked expired first,
 * and stays on record.
 */
export async function createAdmissionInvitation(
  db: Database,
  values: {
    id: string;
    emailKey: string;
    tokenHash: Buffer;
    expiresAt: Date;
    createdBy: string;
    emailStatus?: "sending";
  },
  now = new Date(),
): Promise<AdmissionIssue> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, values.emailKey));
    if (account) return "registered";
    await tx
      .update(admissionInvitations)
      .set({ status: "expired" })
      .where(
        and(
          eq(admissionInvitations.emailKey, values.emailKey),
          eq(admissionInvitations.status, "available"),
          lte(admissionInvitations.expiresAt, now),
        ),
      );
    const issued = await tx
      .insert(admissionInvitations)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: admissionInvitations.id });
    return issued.length > 0 ? "issued" : "invited";
  });
}

/** Every invitation, newest first (DS-100). */
export async function listAdmissionInvitations(db: Database): Promise<AdmissionInvitationRow[]> {
  return db
    .select()
    .from(admissionInvitations)
    .orderBy(desc(admissionInvitations.createdAt), desc(admissionInvitations.id));
}

export async function findAdmissionInvitationById(
  db: Database,
  id: string,
): Promise<AdmissionInvitationRow | undefined> {
  const [invitation] = await db
    .select()
    .from(admissionInvitations)
    .where(eq(admissionInvitations.id, id));
  return invitation;
}

/** An invitation that can still be used at `now`: available and unexpired. */
const usable = (id: string, now: Date) =>
  and(
    eq(admissionInvitations.id, id),
    eq(admissionInvitations.status, "available"),
    gt(admissionInvitations.expiresAt, now),
  );

/**
 * Gives a usable invitation a new token for its resent email, which is sending from now; the earlier link stops
 * working, since only a token's hash is kept. Its address and expiry stay. Returns it, or undefined if it isn't
 * usable.
 */
export async function rotateAdmissionToken(
  db: Database,
  id: string,
  { tokenHash, now = new Date() }: { tokenHash: Buffer; now?: Date },
): Promise<AdmissionInvitationRow | undefined> {
  const [invitation] = await db
    .update(admissionInvitations)
    .set({ tokenHash, emailStatus: "sending" })
    .where(usable(id, now))
    .returning();
  return invitation;
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

/**
 * Revokes a usable invitation, which then can't be redeemed. Returns it, or undefined if it wasn't usable: a
 * redeemed one stays redeemed, so the account it admitted is never touched (FR-11.6).
 */
export async function revokeAdmissionInvitation(
  db: Database,
  id: string,
  now = new Date(),
): Promise<AdmissionInvitationRow | undefined> {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .update(admissionInvitations)
      .set({ status: "revoked" })
      .where(usable(id, now))
      .returning();
    if (invitation) await recordInLedger(tx, { type: "admission.revoked", invitationId: id }, now);
    return invitation;
  });
}

/** Records the invitations past their 14 days as expired: the daily job (TS-91). Use already checks expiry. */
export async function expireAdmissionInvitations(db: Executor, now: Date): Promise<void> {
  await db
    .update(admissionInvitations)
    .set({ status: "expired" })
    .where(
      and(eq(admissionInvitations.status, "available"), lte(admissionInvitations.expiresAt, now)),
    );
}

/** Records how an invitation's email went, while it is still sending (FR-11.6, TS-72). */
export async function recordAdmissionEmail(
  db: Database,
  id: string,
  status: Exclude<EmailStatus, "sending">,
): Promise<void> {
  await db
    .update(admissionInvitations)
    .set({ emailStatus: status })
    .where(and(eq(admissionInvitations.id, id), eq(admissionInvitations.emailStatus, "sending")));
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
 * session in it too: creates their account, agreed to `termsVersion` since joining says so (TON-131), and redeems the
 * invitation, or refuses and changes nothing.
 *
 * The locks make it safe against every concurrent change. The service state is locked for share, so a pause waits
 * for admissions in flight, and an admission after a pause sees it. The invitation is locked for update, so of
 * two registrations, revocations or re-issues of it, the second sees what the first did.
 */
export async function admitAccount(
  tx: Transaction,
  {
    invitationId,
    userId,
    termsVersion,
    now = new Date(),
  }: { invitationId: string; userId: string; termsVersion: string; now?: Date },
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
  await tx.insert(users).values({
    id: userId,
    email: invitation.emailKey,
    emailVerified: true,
    termsVersion,
    termsAgreedAt: now,
  });
  await tx
    .update(admissionInvitations)
    .set({ status: "redeemed", redeemedBy: userId, redeemedAt: now })
    .where(eq(admissionInvitations.id, invitation.id));
  return { admitted: true, userId, emailKey: invitation.emailKey };
}
