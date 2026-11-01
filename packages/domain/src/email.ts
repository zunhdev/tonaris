// Outgoing email (TS-72): the port adapters implement, and the templates as plain English text. Rendering is
// pure, so every adapter (Resend's API, or SMTP: Mailpit locally) sends exactly the same words.

import { signInCode } from "./accounts";
import { admissionInvitationDays } from "./admission";
import { containerKinds, type ContainerKind } from "./containers";
import { z } from "./zod";

/** Each template and the data it needs. */
export type EmailTemplates = {
  /** The sign-in code, plus a link to the web app's verify page that submits it (TS-70, DS-90). */
  "sign-in-code": { code: string; link: string };
  /** Sent instead of a code when no account has the address, so the sign-in page reveals nothing (DS-90). */
  "sign-in-no-account": Record<string, never>;
  /** The code that creates an invited account, plus a link to the invitation page that submits it (DS-91). */
  "join-code": { code: string; link: string };
  /** The creator's admission invitation (FR-11.6): a link to its landing page, which only this address can use. */
  "admission-invitation": { link: string };
  /** Step 2 of changing the sign-in email (DS-93), sent to the current address. */
  "email-change-current": { code: string; newEmail: string };
  /** Step 3 of changing the sign-in email (DS-93), sent to the new address. */
  "email-change-new": { code: string };
  /** Creator-assisted recovery (TS-73): the code and link that verify the new address. */
  "recovery-verification": { code: string; link: string };
  /** A passkey was added to the account (DS-93): its name, and Settings → Account, where it can be removed. */
  "passkey-added": { name: string; link: string };
  /** A sharing invitation (FR-07.5): who shares what, and the invitation's page, which needs sign-in. */
  "share-invitation": {
    ownerName: string;
    containerName: string;
    kind: ContainerKind;
    link: string;
  };
};
export type EmailTemplate = keyof EmailTemplates;

export type RenderedEmail = { subject: string; text: string };

/** The record whose `email_status` says how its email went (FR-07.5, FR-11.6), as an email's job carries it. */
export const emailOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("share_grant"), id: z.string() }),
  z.object({ kind: z.literal("admission_invitation"), id: z.string() }),
]);
export type EmailOutcome = z.infer<typeof emailOutcomeSchema>;

export type EmailOptions = {
  /** Where the outcome is recorded: sent, failed, or unknown when it couldn't be confirmed. */
  outcome?: EmailOutcome;
  /** The same key on a retry makes the provider send the email once (Resend keeps keys for 24 hours). */
  idempotencyKey?: string;
};

/**
 * Sends one email. The API's port queues it (TS-90); the providers' adapters send it, rendering with
 * `renderEmail`, and reject with `EmailDeliveryError` when they can tell whether trying again could help.
 */
export type EmailPort = {
  send<T extends EmailTemplate>(
    template: T,
    to: string,
    data: EmailTemplates[T],
    options?: EmailOptions,
  ): Promise<void>;
};

/**
 * Why an adapter couldn't send. `retryable` means trying again may work, as after a timeout or an outage;
 * `uncertain` means the provider may have sent it anyway, as when a request timed out.
 */
export class EmailDeliveryError extends Error {
  override name = "EmailDeliveryError";
  readonly retryable: boolean;
  readonly uncertain: boolean;
  constructor(
    message: string,
    {
      retryable,
      uncertain = false,
      cause,
    }: { retryable: boolean; uncertain?: boolean; cause?: unknown },
  ) {
    super(message, { cause });
    this.retryable = retryable;
    this.uncertain = uncertain;
  }
}

const codeAndLink = z.object({ code: z.string(), link: z.string() });

/** Each template's data, checked when a queued email is read back (TS-90). */
export const emailDataSchemas: { [T in EmailTemplate]: z.ZodType<EmailTemplates[T]> } = {
  "sign-in-code": codeAndLink,
  "sign-in-no-account": z.object({}),
  "join-code": codeAndLink,
  "share-invitation": z.object({
    ownerName: z.string(),
    containerName: z.string(),
    kind: z.enum(containerKinds),
    link: z.string(),
  }),
  "admission-invitation": z.object({ link: z.string() }),
  "email-change-current": z.object({ code: z.string(), newEmail: z.string() }),
  "email-change-new": z.object({ code: z.string() }),
  "recovery-verification": codeAndLink,
  "passkey-added": z.object({ name: z.string(), link: z.string() }),
};

/** A template's name. */
export const emailTemplateSchema = z.custom<EmailTemplate>(
  (value) => typeof value === "string" && Object.hasOwn(emailDataSchemas, value),
);

/** How long an email is worth sending, for the ones carrying a code: once the code expires, it isn't. */
export const emailLifetimeMs: Partial<Record<EmailTemplate, number>> = {
  "sign-in-code": signInCode.validMinutes * 60_000,
  "join-code": signInCode.validMinutes * 60_000,
  "email-change-current": signInCode.validMinutes * 60_000,
  "email-change-new": signInCode.validMinutes * 60_000,
};

const ignoreLine = "If you didn't ask to sign in, you can ignore this email.";

const renderers: { [T in EmailTemplate]: (data: EmailTemplates[T]) => RenderedEmail } = {
  "sign-in-code": ({ code, link }) => ({
    subject: "Your Tonaris sign-in code",
    text: [
      "Your sign-in code is:",
      "",
      code,
      "",
      "Enter it on the sign-in page, or open this link to sign in on this device:",
      link,
      "",
      `The code works once and expires in ${signInCode.validMinutes} minutes. ${ignoreLine}`,
    ].join("\n"),
  }),
  "sign-in-no-account": () => ({
    subject: "Signing in to Tonaris",
    text: [
      "Someone asked to sign in to Tonaris with this address, but there is no Tonaris account for it.",
      "",
      "Tonaris is invite-only, so accounts are created from an invitation. If you have an account under a different address, sign in with that one.",
      "",
      ignoreLine,
    ].join("\n"),
  }),
  "share-invitation": ({ ownerName, containerName, kind, link }) => ({
    subject: `${ownerName} invited you to view "${containerName}" on Tonaris`,
    text: [
      `${ownerName} invited you to view the ${kind} "${containerName}" on Tonaris.`,
      "",
      "Open the invitation to accept or decline it:",
      link,
      "",
      "You'll be asked to sign in with this address. The link works only for you: forwarding it gives no one access.",
    ].join("\n"),
  }),
  "join-code": ({ code, link }) => ({
    subject: "Your code to join Tonaris",
    text: [
      "Your code to join Tonaris is:",
      "",
      code,
      "",
      "Enter it on the invitation page, or open this link to join on this device:",
      link,
      "",
      `The code works once and expires in ${signInCode.validMinutes} minutes. If you didn't ask to join Tonaris, you can ignore this email.`,
    ].join("\n"),
  }),
  "admission-invitation": ({ link }) => ({
    subject: "You're invited to join Tonaris",
    text: [
      "You're invited to join Tonaris, a home for your music collection.",
      "",
      "Open the invitation to create your account:",
      link,
      "",
      `The invitation works once, only for this address, and expires in ${admissionInvitationDays} days. If you weren't expecting it, you can ignore this email.`,
    ].join("\n"),
  }),
  "email-change-current": ({ code, newEmail }) => ({
    subject: "Your code to change your Tonaris sign-in email",
    text: [
      `Someone asked to change your Tonaris sign-in email to ${newEmail}. To confirm it's you, enter this code in Tonaris:`,
      "",
      code,
      "",
      `The code works once and expires in ${signInCode.validMinutes} minutes. If you didn't ask for this, you can ignore this email: your sign-in email stays the same.`,
    ].join("\n"),
  }),
  "email-change-new": ({ code }) => ({
    subject: "Your code to confirm your new Tonaris sign-in email",
    text: [
      "To make this address your Tonaris sign-in email, enter this code in Tonaris:",
      "",
      code,
      "",
      `The code works once and expires in ${signInCode.validMinutes} minutes. If you didn't ask for this, you can ignore this email.`,
    ].join("\n"),
  }),
  "recovery-verification": ({ code, link }) => ({
    subject: "Confirm your new Tonaris sign-in email",
    text: [
      "You asked the Tonaris creator to move your account to this address. To confirm, your code is:",
      "",
      code,
      "",
      "Enter it on the confirmation page, or open this link:",
      link,
      "",
      "Once confirmed, you sign in with this address, and your old address stops working. If you didn't ask for this, you can ignore this email.",
    ].join("\n"),
  }),
  "passkey-added": ({ name, link }) => ({
    subject: "A passkey was added to your Tonaris account",
    text: [
      `A passkey named "${name}" was added to your Tonaris account. It signs in without an emailed code.`,
      "",
      "If you added it, there's nothing to do. If you didn't, remove it in Settings → Account:",
      link,
    ].join("\n"),
  }),
};

export function renderEmail<T extends EmailTemplate>(
  template: T,
  data: EmailTemplates[T],
): RenderedEmail {
  return renderers[template](data);
}
