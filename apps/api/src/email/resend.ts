// The Resend adapter of the email port (TS-72), the provider chosen in TON-73: one call to its send API per email,
// through `safeFetch` like every outbound call. The job's id is the idempotency key, so a retry after a timeout
// never sends twice (Resend keeps keys for 24 hours). Errors say whether trying again could help:
// rate limits, Resend's outages and timeouts can; a refused address, an unverified sender or a used-up quota can't.

import { z } from "zod";

import { EmailDeliveryError, renderEmail, type EmailPort } from "@tonaris/domain";
import { safeFetch, SafeFetchError, type SafeFetchInit } from "@tonaris/providers";

export const resendEndpoint = "https://api.resend.com/emails";
const timeoutMs = 10_000;

/** The body of Resend's error responses. */
const resendError = z.object({ name: z.string(), message: z.string() }).partial();

/** 429s that waiting a few minutes won't fix. */
const quotaErrors = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"]);

export function resendEmail({
  apiKey,
  emailFrom,
  fetch = safeFetch,
}: {
  apiKey: string;
  emailFrom: string;
  fetch?: (url: string, init: SafeFetchInit) => Promise<Response>;
}): EmailPort {
  return {
    async send(template, to, data, { idempotencyKey } = {}) {
      const { subject, text } = renderEmail(template, data);
      let response: Response;
      try {
        response = await fetch(resendEndpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
          },
          body: JSON.stringify({ from: emailFrom, to: [to], subject, text }),
          timeoutMs,
        });
      } catch (error) {
        const timedOut = error instanceof SafeFetchError && error.reason === "timeout";
        throw new EmailDeliveryError(
          timedOut ? "Resend didn't answer in time." : "Couldn't reach Resend.",
          { retryable: true, uncertain: timedOut, cause: error },
        );
      }
      if (response.ok) return;

      const parsed = resendError.safeParse(await response.json().catch(() => undefined));
      const name = parsed.data?.name ?? "unknown";
      const retryable =
        response.status >= 500 ||
        (response.status === 429 && !quotaErrors.has(name)) ||
        name === "concurrent_idempotent_requests";
      throw new EmailDeliveryError(
        `Resend refused the email: ${response.status} ${name}${parsed.data?.message ? `, ${parsed.data.message}` : ""}`,
        { retryable },
      );
    },
  };
}
