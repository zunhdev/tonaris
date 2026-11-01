// Email through the job queue (TS-72, TS-90). The API's email port queues each email as a job and wakes the worker,
// so a request never waits on the provider, and an email outlives a restart. The job sends it through the provider's
// adapter, records the outcome on its record (FR-07.5, FR-11.6), and is retried while the adapter says that may help.
//
// A code's email is dropped once the code has expired. A job's payload can hold a code or an invitation's token,
// which the database otherwise keeps only hashed: a sent email's job is deleted, and a buried one keeps only its
// template and address.

import { z } from "zod";

import {
  enqueueJob,
  recordAdmissionEmail,
  recordInvitationEmail,
  type Database,
  type JobRow,
} from "@tonaris/db";
import {
  EmailDeliveryError,
  emailDataSchemas,
  emailLifetimeMs,
  emailOutcomeSchema,
  emailTemplateSchema,
  type EmailOutcome,
  type EmailPort,
} from "@tonaris/domain";

import type { JobHandler } from "../jobs/worker";

export const emailJobKind = "email";

const emailJobSchema = z.object({
  template: emailTemplateSchema,
  to: z.string(),
  data: z.unknown(),
  outcome: emailOutcomeSchema.optional(),
  /** When the email stops being worth sending: its code's expiry. */
  expiresAt: z.iso.datetime().optional(),
});

/** The API's email port: queues the email and wakes the worker. */
export function emailOutbox(db: Database, wake: () => void): EmailPort {
  return {
    async send(template, to, data, { outcome } = {}) {
      const lifetime = emailLifetimeMs[template];
      await enqueueJob(db, {
        id: Bun.randomUUIDv7(),
        kind: emailJobKind,
        payload: {
          template,
          to,
          data,
          ...(outcome ? { outcome } : {}),
          ...(lifetime ? { expiresAt: new Date(Date.now() + lifetime).toISOString() } : {}),
        },
      });
      wake();
    },
  };
}

function recordOutcome(
  db: Database,
  outcome: EmailOutcome,
  status: "sent" | "failed" | "unknown",
): Promise<void> {
  return outcome.kind === "share_grant"
    ? recordInvitationEmail(db, outcome.id, status)
    : recordAdmissionEmail(db, outcome.id, status);
}

/** The job that sends a queued email through `transport`, the provider's adapter. */
export function emailJob(db: Database, transport: EmailPort): JobHandler {
  return {
    kind: emailJobKind,
    async run(job: JobRow) {
      const email = emailJobSchema.parse(job.payload);
      if (email.expiresAt && Date.parse(email.expiresAt) <= Date.now()) {
        throw new EmailDeliveryError("The email's code expired before it could be sent.", {
          retryable: false,
        });
      }
      const data = emailDataSchemas[email.template].parse(email.data);
      await transport.send(email.template, email.to, data, { idempotencyKey: job.id });
      if (email.outcome) await recordOutcome(db, email.outcome, "sent");
    },
    retryable: (error) => !(error instanceof EmailDeliveryError) || error.retryable,
    async buried(job, error) {
      const email = emailJobSchema.safeParse(job.payload);
      if (!email.success) return {};
      // A timeout leaves it open whether the provider sent it: unconfirmed, not failed (FR-07.5).
      const uncertain = error instanceof EmailDeliveryError && error.uncertain;
      if (email.data.outcome) {
        await recordOutcome(db, email.data.outcome, uncertain ? "unknown" : "failed");
      }
      return { template: email.data.template, to: email.data.to };
    },
  };
}
