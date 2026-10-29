// The SMTP adapter of the email port (TS-72): Mailpit locally (TS-06), and the fallback for a host without Resend.
// Templates render in packages/domain, so every adapter sends the same text. A server's 5xx answer is final; a
// lost connection or a 4xx answer is worth trying again.

import { createTransport } from "nodemailer";

import { EmailDeliveryError, renderEmail, type EmailPort } from "@tonaris/domain";

import type { ApiConfig } from "../config";

export function smtpEmail({
  smtpUrl,
  emailFrom,
}: Pick<ApiConfig, "smtpUrl" | "emailFrom">): EmailPort {
  const transport = createTransport(smtpUrl);
  return {
    async send(template, to, data) {
      const { subject, text } = renderEmail(template, data);
      try {
        await transport.sendMail({ from: emailFrom, to, subject, text });
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "responseCode" in error
            ? error.responseCode
            : undefined;
        const refused = typeof code === "number" && code >= 500;
        throw new EmailDeliveryError(
          refused ? `The SMTP server refused the email (${code}).` : "Couldn't send through SMTP.",
          { retryable: !refused, cause: error },
        );
      }
    },
  };
}
