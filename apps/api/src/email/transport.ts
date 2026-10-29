// Which adapter sends email (TS-72): Resend when its API key is set, SMTP otherwise, which is Mailpit locally.

import type { EmailPort } from "@tonaris/domain";

import type { ApiConfig } from "../config";
import { resendEmail } from "./resend";
import { smtpEmail } from "./smtp";

export function emailTransport(
  config: Pick<ApiConfig, "resendApiKey" | "smtpUrl" | "emailFrom">,
): EmailPort {
  return config.resendApiKey
    ? resendEmail({ apiKey: config.resendApiKey, emailFrom: config.emailFrom })
    : smtpEmail(config);
}
