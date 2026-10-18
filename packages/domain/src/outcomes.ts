// The outcome vocabulary (TS-27), shared by commands, the HTTP API, MCP and every client. Statuses and
// codes are a contract: clients must tolerate codes added later (TS-09).

import { z } from "zod";

/** Why an operation was rejected (TS-27). Rejections change nothing (X-05). */
export const errorCodes = [
  "validation_failed",
  "required_missing",
  "name_conflict",
  "capacity_exceeded",
  "limit_exceeded",
  "permission_denied",
  "app_only",
  "not_found",
  "trashed",
  "cycle",
  "invalid_destination",
  "field_in_use",
  "uncertain_match",
  "unsupported_link",
  "provider_unavailable",
  "rate_limited",
  "expired",
  "internal_error",
] as const;
export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** One invalid input: where it is (`query.limit`, `body.title`) and what is wrong with it. */
export const invalidParamSchema = z.object({ path: z.string(), message: z.string() });

/** RFC 9457 problem details, as the API sends every error (TS-09). */
export const problemSchema = z
  .object({
    type: z
      .string()
      .meta({ description: "`about:blank`: the status and `code` carry the meaning." }),
    title: z.string().meta({ description: "The HTTP status phrase." }),
    status: z.int(),
    detail: z.string().optional().meta({ description: "What went wrong, for people." }),
    instance: z.string().optional().meta({ description: "The request path." }),
    code: errorCodeSchema.meta({ description: "Machine-readable error code (TS-27)." }),
    errors: z
      .array(invalidParamSchema)
      .optional()
      .meta({ description: "Each invalid input, for `validation_failed`." }),
  })
  .meta({ description: "RFC 9457 problem details" });
export type Problem = z.infer<typeof problemSchema>;

/**
 * Every outcome status (TS-27). `pending` and `unconfirmed` exist only on clients: queued or in flight,
 * and sent without a known result (TS-22). The server reports the others.
 */
export const outcomeStatuses = [
  "pending",
  "confirmed",
  "failed",
  "conflict",
  "unconfirmed",
  "needs_input",
  "needs_approval",
  "skipped",
] as const;
export type OutcomeStatus = (typeof outcomeStatuses)[number];

/** A field whose saved value no longer matched the mutation's `base` (TS-21). */
export const fieldConflictSchema = z.object({
  field: z.string(),
  current: z.unknown(),
  attempted: z.unknown(),
  base: z.unknown(),
});
export type FieldConflict = z.infer<typeof fieldConflictSchema>;

/** The choices a command asks for instead of guessing (TS-26). */
export const inputNeeds = ["destination", "name", "match"] as const;

/** What the server reports for one mutation or batch item. */
export const outcomeSchema = z.discriminatedUnion("status", [
  /** Committed at this `seq`; the client waits for the stream to reach it (TS-24). */
  z.object({ status: z.literal("confirmed"), seq: z.int().nonnegative(), result: z.unknown() }),
  /** Rejected; nothing changed (X-05). */
  z.object({ status: z.literal("failed"), code: errorCodeSchema, problem: problemSchema }),
  /** Field-level CAS mismatch; nothing changed (TS-21). */
  z.object({ status: z.literal("conflict"), conflicts: z.array(fieldConflictSchema).min(1) }),
  /** A choice is required; resubmit as a new mutation carrying it (TS-26). */
  z.object({
    status: z.literal("needs_input"),
    need: z.enum(inputNeeds),
    candidates: z.array(z.unknown()),
  }),
  /** An MCP gated operation waits for the owner's approval (TS-64). */
  z.object({ status: z.literal("needs_approval"), approvalId: z.string() }),
  /** A batch item whose prerequisite did not succeed was not run (TS-25). */
  z.object({
    status: z.literal("skipped"),
    dependsOn: z.string(),
    because: z.enum(["failed", "skipped", "pending"]),
  }),
]);
export type Outcome = z.infer<typeof outcomeSchema>;
