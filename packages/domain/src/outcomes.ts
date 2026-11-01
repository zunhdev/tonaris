// The outcome vocabulary (TS-27), shared by commands, the HTTP API, MCP and every client. Statuses and
// codes are a contract: clients must tolerate codes added later (TS-09).

import { z } from "./zod";

/** Why an operation was rejected (TS-27). Rejections change nothing (X-05). */
export const errorCodes = [
  "validation_failed",
  "required_missing",
  "name_conflict",
  "capacity_exceeded",
  "limit_exceeded",
  "unauthenticated",
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
  "in_progress",
  "recipient_not_found",
  "display_name_required",
  "internal_error",
] as const;
export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** The HTTP status each code's problem carries, inside an outcome or as a response (TS-09). */
const codeStatuses: Record<ErrorCode, number> = {
  validation_failed: 422,
  required_missing: 422,
  name_conflict: 409,
  capacity_exceeded: 409,
  limit_exceeded: 409,
  unauthenticated: 401,
  permission_denied: 403,
  app_only: 403,
  not_found: 404,
  trashed: 409,
  cycle: 409,
  invalid_destination: 409,
  field_in_use: 409,
  uncertain_match: 409,
  unsupported_link: 422,
  provider_unavailable: 503,
  rate_limited: 429,
  expired: 410,
  in_progress: 409,
  recipient_not_found: 422,
  display_name_required: 409,
  internal_error: 500,
};

const statusTitles: Record<number, string> = {
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

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
  base: z
    .unknown()
    .optional()
    .meta({ description: "The value the change assumed; absent when it created the record." }),
});
export type FieldConflict = z.infer<typeof fieldConflictSchema>;

/**
 * Why a batch item was skipped: its prerequisite's status (TS-25). `pending` is a prerequisite still running, as a
 * capture waiting on a provider will be.
 */
export const skipReasons = [
  "failed",
  "conflict",
  "skipped",
  "needs_input",
  "needs_approval",
  "pending",
] as const;

/**
 * The choices a command asks for instead of guessing (TS-26). `details` asks for an album's title, artist and year,
 * when a link can't be identified (FR-02.3, FR-10.5).
 */
export const inputNeeds = ["destination", "name", "match", "details"] as const;

/** Rejected; nothing changed (X-05). */
export const failedOutcomeSchema = z.object({
  status: z.literal("failed"),
  code: errorCodeSchema,
  problem: problemSchema,
});

/** Field-level CAS mismatch; nothing changed (TS-21). */
export const conflictOutcomeSchema = z.object({
  status: z.literal("conflict"),
  conflicts: z.array(fieldConflictSchema).min(1),
});

/** A choice is required; resubmit as a new mutation carrying it (TS-26). */
export const needsInputOutcomeSchema = z.object({
  status: z.literal("needs_input"),
  need: z.enum(inputNeeds),
  candidates: z.array(z.unknown()),
});

/**
 * What the server reports for one mutation or batch item. Clients keep failures, conflicts and choices to make for
 * the person through the members above, so a kept outcome never drops a field added later (TS-24).
 */
export const outcomeSchema = z.discriminatedUnion("status", [
  /** Committed at this `seq`; the client waits for the stream to reach it (TS-24). */
  z.object({
    status: z.literal("confirmed"),
    seq: z.int().nonnegative(),
    result: z.unknown().meta({
      description:
        "What the mutation reports. `membership.add` gives `{alreadyInList: boolean}`, true when the album was already in the list (FR-01.7); `album.capture` gives a `CaptureResult`; the others give null.",
    }),
  }),
  failedOutcomeSchema,
  conflictOutcomeSchema,
  needsInputOutcomeSchema,
  /** An MCP gated operation waits for the owner's approval (TS-64). */
  z.object({ status: z.literal("needs_approval"), approvalId: z.string() }),
  /** A batch item whose prerequisite did not succeed was not run (TS-25). */
  z.object({
    status: z.literal("skipped"),
    dependsOn: z
      .string()
      .meta({ description: "The `mutationId` of the first prerequisite not confirmed." }),
    because: z.enum(skipReasons).meta({ description: "That prerequisite's status." }),
  }),
]);
export type Outcome = z.infer<typeof outcomeSchema>;

export type Failure = Extract<Outcome, { status: "failed" }>;

/** A `failed` outcome: nothing changed (X-05), and the problem says why. */
export function failure(
  code: ErrorCode,
  detail: string,
  errors?: z.infer<typeof invalidParamSchema>[],
): Failure {
  const status = codeStatuses[code];
  return {
    status: "failed",
    code,
    problem: {
      type: "about:blank",
      title: statusTitles[status] ?? "Error",
      status,
      code,
      detail,
      ...(errors ? { errors } : {}),
    },
  };
}
