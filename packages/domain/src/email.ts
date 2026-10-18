// Outgoing email (TS-72): the port adapters implement, and the templates as plain English text. Rendering is
// pure, so every adapter (SMTP now, the chosen provider's API later) sends exactly the same words.

import { signInCode } from "./accounts";

/** Each template and the data it needs. */
export type EmailTemplates = {
  /** The sign-in code, plus a link to the web app's verify page that submits it (TS-70, DS-90). */
  "sign-in-code": { code: string; link: string };
  /** Sent instead of a code when no account has the address, so the sign-in page reveals nothing (DS-90). */
  "sign-in-no-account": Record<string, never>;
};
export type EmailTemplate = keyof EmailTemplates;

export type RenderedEmail = { subject: string; text: string };

/** Sends one email. Implementations render with `renderEmail` and report failures by rejecting. */
export type EmailPort = {
  send<T extends EmailTemplate>(template: T, to: string, data: EmailTemplates[T]): Promise<void>;
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
};

export function renderEmail<T extends EmailTemplate>(
  template: T,
  data: EmailTemplates[T],
): RenderedEmail {
  return renderers[template](data);
}
