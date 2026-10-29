// Admission (FR-11.2, FR-11.6, TS-71): accounts are created only from the creator's invitations. Each invitation
// is bound to one email key, works once, and expires after 14 days; while admissions are paused, none works.

import { emailStatuses } from "./sharing";
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

/** Looks up an invitation, or asks for a code to its address. The token is the one in the invitation link (DS-91). */
export const joinCodeRequestSchema = z.object({ token: z.string().min(1).max(200) });

/** Creates the account with the emailed code, and signs in. */
export const joinSchema = z.object({
  token: z.string().min(1).max(200),
  otp: z.string().min(1).max(32),
});

/** Why the creator's admin refuses an invitation or an action on one (FR-11.6), as one sentence each. */
export const admissionAdminRefusalDetails = {
  notEmail: "Enter an email address, such as anna@example.com.",
  registered: (email: string) => `${email} already has a Tonaris account.`,
  invited: (email: string) =>
    `${email} already has an invitation. Resend it, or revoke it to invite them again.`,
  resendUnavailable: "Only an available invitation can be sent again.",
  revokeUnavailable: "Only an available invitation can be revoked.",
} as const;

/** An invitation as the creator's admin lists it (DS-100): its status and its email's delivery, apart (FR-11.6). */
export const admissionInvitationSchema = z
  .object({
    id: z.uuid(),
    email: z.string().meta({ description: "The address it is bound to, as its email key." }),
    status: z.enum(admissionInvitationStatuses).meta({
      description: "The status that holds now: an available invitation past its expiry is expired.",
    }),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    redeemedAt: z.iso.datetime().nullable(),
    emailStatus: z.enum(emailStatuses).nullable().meta({
      description:
        "How its latest email went: sending, sent, failed, or unknown when it couldn't be confirmed.",
    }),
  })
  .meta({ description: "An admission invitation (FR-11.6, TS-71)." });
export type AdmissionInvitation = z.infer<typeof admissionInvitationSchema>;

/** The creator's admin: the pause switch and every invitation, newest first (DS-100). */
export const admissionsSchema = z
  .object({
    paused: z.boolean().meta({ description: "While true, no account is created (FR-11.2)." }),
    invitations: z.array(admissionInvitationSchema),
  })
  .meta({
    description: "Admission administration (FR-11.6): the pause switch and the invitations.",
  });
export type Admissions = z.infer<typeof admissionsSchema>;

/** Invites one address. */
export const admissionInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .meta({ description: "The address to invite, as typed." }),
});

/** Pauses or resumes admissions. */
export const admissionsPausedSchema = z.object({ paused: z.boolean() });
