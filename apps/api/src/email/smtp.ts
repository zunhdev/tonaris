// The SMTP adapter of the email port (TS-72): Mailpit locally (TS-06), and the fallback once a provider's HTTP
// API is in place (TON-73). Templates render in packages/domain, so every adapter sends the same text.

import { createTransport } from "nodemailer";

import { renderEmail, type EmailPort } from "@tonaris/domain";

import type { ApiConfig } from "../config";

export function smtpEmail({
  smtpUrl,
  emailFrom,
}: Pick<ApiConfig, "smtpUrl" | "emailFrom">): EmailPort {
  const transport = createTransport(smtpUrl);
  return {
    async send(template, to, data) {
      const { subject, text } = renderEmail(template, data);
      await transport.sendMail({ from: emailFrom, to, subject, text });
    },
  };
}
