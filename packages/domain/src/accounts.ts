// Accounts (FR-11): how an email address identifies an account, the roles, and the signed-in account as every
// client sees it (`GET /v1/me`).

import { z } from "./zod";

/** The sign-in code rules (TS-70): 6 digits, valid for 10 minutes, single-use, with 5 attempts. */
export const signInCode = { length: 6, validMinutes: 10, attempts: 5 } as const;

/** `creator` adds admission administration, never access to other people's data (TS-30). */
export const userRoles = ["creator", "user"] as const;
export type UserRole = (typeof userRoles)[number];

/**
 * The key an account's email is stored and matched under (TS-70): trimmed, lowercased, and with an
 * internationalized domain converted to ASCII. Plus-addresses are kept as they are, so `a+b@x` and `a@x`
 * are different accounts.
 */
export function emailKey(email: string): string {
  const lowered = email.trim().toLowerCase();
  const at = lowered.lastIndexOf("@");
  if (at < 0) return lowered;
  return `${lowered.slice(0, at)}@${asciiDomain(lowered.slice(at + 1))}`;
}

/** IDNA to ASCII through the URL parser, which browsers and Bun both have. */
function asciiDomain(domain: string): string {
  // Plain ASCII needs nothing; a value URL syntax would reinterpret ("x.com/y") is left for validation to reject.
  if (/^[ -~]*$/.test(domain) || /[\s/?#@:\\%[\]]/.test(domain)) return domain;
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return domain;
  }
}

/** The signed-in account (`GET /v1/me`). */
export const accountSchema = z
  .object({
    id: z.uuid(),
    email: z.string().meta({ description: "The sign-in email, as its email key." }),
    displayName: z
      .string()
      .nullable()
      .meta({ description: "The display name (FR-11.3); null until the person sets one." }),
    role: z.enum(userRoles),
  })
  .meta({ description: "The signed-in account." });
export type Account = z.infer<typeof accountSchema>;

/** How long a creator's recovery waits for the new address to confirm it (FR-11.5, TS-73). */
export const emailRecoveryHours = 24;

/** What the audit log records (TS-11): admin actions, recovery and deletions, each as one action name. */
export const auditActions = ["email.change", "email.recover", "account.delete"] as const;
export type AuditAction = (typeof auditActions)[number];

/**
 * A sign-in email change's steps (FR-11.4, TS-73): the code sent to the current address is entered first, then
 * the one sent to the new address.
 */
export const emailChangeStages = ["current", "new"] as const;
export type EmailChangeStage = (typeof emailChangeStages)[number];

/** Why a step of the email change is refused (DS-90, DS-93), one sentence each. */
export const emailChangeRefusalDetails = {
  notEmail: "Enter an email address, such as anna@example.com.",
  same: "That's already your sign-in email.",
  taken: "That address belongs to another Tonaris account.",
  none: "There's no email change in progress. Start again.",
  wrongCode: "That code isn't right. Check the email and try again.",
  expired: "This code has expired. Send a new code.",
  tooManyAttempts: "Too many wrong codes. Send a new code.",
} as const;

/** The change in progress: the new address and the step its code is for. */
export const emailChangeSchema = z
  .object({
    newEmail: z.string().meta({ description: "The new address, as its email key." }),
    stage: z.enum(emailChangeStages).meta({
      description: "Whose code is asked for: the current address's, then the new one's.",
    }),
  })
  .meta({ description: "A sign-in email change in progress (FR-11.4)." });
export type EmailChange = z.infer<typeof emailChangeSchema>;

/** Starts a change to `newEmail`; a change in progress is replaced. */
export const emailChangeStartSchema = z.object({
  newEmail: z.string().trim().min(1).max(320).meta({ description: "The new address, as typed." }),
});

/** A step's code, from its email. */
export const emailChangeCodeSchema = z.object({ code: z.string().min(1).max(32) });

/** What a right code leads to: the new address's step, or the change done. */
export const emailChangeStepSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("new"), newEmail: z.string() }),
  z.object({
    stage: z.literal("done"),
    email: z.string().meta({ description: "The account's sign-in email from now on." }),
  }),
]);
export type EmailChangeStep = z.infer<typeof emailChangeStepSchema>;

/** Why the creator's recovery, or its confirmation, is refused (FR-11.5, DS-100), one sentence each. */
export const emailRecoveryRefusalDetails = {
  notEmail: "Enter an email address, such as anna@example.com.",
  same: "That's already their sign-in email.",
  taken: "That address belongs to another Tonaris account.",
  noReason: "Say why you're recovering this account. It goes in the audit log.",
  none: "There's no member with this ID.",
  invalid: "This recovery link isn't valid. Ask the creator for a new one.",
  expired: "This recovery link has expired. Ask the creator for a new one.",
  wrongCode: "That code isn't right. Check the email and try again.",
  tooManyAttempts: "Too many wrong codes. Ask the creator for a new link.",
} as const;

/** The longest reason a recovery records. */
export const maxRecoveryReasonLength = 500;

/** A member as Admin → Members lists them (DS-100): never anything of their collection (FR-11.6). */
export const memberSchema = z
  .object({
    id: z.uuid(),
    email: z.string().meta({ description: "The sign-in email, as its email key." }),
    displayName: z.string().nullable(),
    joinedAt: z.iso.datetime(),
    recovery: z
      .object({ newEmail: z.string(), requestedAt: z.iso.datetime() })
      .nullable()
      .meta({ description: "A recovery waiting for its new address to confirm it (FR-11.5)." }),
  })
  .meta({ description: "An account, as the creator's admin lists it." });
export type Member = z.infer<typeof memberSchema>;

/** Starts recovering a member's sign-in email: the new address, why, and whether AI connections end too. */
export const emailRecoveryStartSchema = z.object({
  newEmail: z.string().trim().min(1).max(320),
  reason: z
    .string()
    .max(maxRecoveryReasonLength)
    .meta({ description: "Why the creator recovers it, for the audit log." }),
  disconnectConnections: z.boolean(),
});

/** Confirms a recovery from its email: the link's token and the code. */
export const emailRecoveryConfirmSchema = z.object({
  token: z.string().min(1).max(200),
  code: z.string().min(1).max(32),
});

/** Where people write for help, such as recovering a lost address (TS-73). */
export const supportSchema = z
  .object({ email: z.string() })
  .meta({ description: "The support address (`SUPPORT_EMAIL`)." });

/** An account deletion's progress (FR-11.11, TS-74): the data job is running, done, or gave up and can be retried. */
export const accountDeletionStatuses = ["deleting", "deleted", "failed"] as const;
export type AccountDeletionStatus = (typeof accountDeletionStatuses)[number];

/** The job that removes a deleted account's data (TS-90, TS-74). */
export const accountDeletionJobKind = "account-deletion";

/** Why deleting the account is refused, or its progress can't be found (DS-97), one sentence each. */
export const accountDeletionRefusalDetails = {
  mismatch: "Type your sign-in email exactly to confirm.",
  creator: "The creator's account can't be deleted: it runs admissions.",
  none: "There's no account deletion for this page.",
} as const;

/** Confirms deleting the account: the sign-in email, typed. */
export const accountDeletionConfirmSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .meta({ description: "The account's sign-in email, typed to confirm." }),
});

/** The token that follows a deletion once its session is gone. */
export const accountDeletionTokenSchema = z.object({ token: z.string().min(1).max(200) });

/** A deletion's progress. */
export const accountDeletionProgressSchema = z.object({ status: z.enum(accountDeletionStatuses) });
