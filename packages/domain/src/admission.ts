// Admission (FR-11.2, FR-11.6, TS-71): accounts are created only from the creator's invitations. Each invitation
// is bound to one email key, works once, and expires after 14 days; while admissions are paused, none works.

import { z } from "./zod";

/** How long an invitation stays available (TS-71, approved 17 October 2026). */
export const admissionInvitationDays = 14;

/** An invitation's stored status. An available invitation past its expiry counts as `expired` (`invitationStatus`). */
export const admissionInvitationStatuses = ["available", "redeemed", "revoked", "expired"] as const;
export type AdmissionInvitationStatus = (typeof admissionInvitationStatuses)[number];

/** The status that holds at `now`: expiry is checked on use, before the daily job records it (TS-110). */
export function invitationStatus(
  invitation: { status: AdmissionInvitationStatus; expiresAt: Date },
  now = new Date(),
): AdmissionInvitationStatus {
  return invitation.status === "available" && invitation.expiresAt <= now
    ? "expired"
    : invitation.status;
}

/** Why an invitation can't create an account now: its status, an unknown link, or paused admissions. */
export type AdmissionRefusal =
  | Exclude<AdmissionInvitationStatus, "available">
  | "invalid"
  | "paused";

/** One plain sentence for each refusal (DS-91). */
export const admissionRefusalDetails: Record<AdmissionRefusal, string> = {
  invalid: "This invitation link isn't valid.",
  revoked: "This invitation has been withdrawn.",
  redeemed: "This invitation has already been used. If you joined with it, sign in.",
  expired: "This invitation has expired. Ask for a new one.",
  paused:
    "Tonaris isn't accepting new members right now. Your invitation will work again when it reopens.",
};

/** Asks for a code to the invitation's address. The token is the one in the invitation link (DS-91). */
export const joinCodeRequestSchema = z.object({ token: z.string().min(1).max(200) });

/** Creates the account with the emailed code, and signs in. */
export const joinSchema = z.object({
  token: z.string().min(1).max(200),
  otp: z.string().min(1).max(32),
});
