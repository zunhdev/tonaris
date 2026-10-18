// Every error the API returns is an RFC 9457 problem (`application/problem+json`) carrying a TS-27 `code`
// (TS-09). Elysia 2 already answers with problems, but with its own codes, and it includes error messages
// outside production; this plugin maps each error to our vocabulary and never exposes internals.

import { Elysia, NotFound, ParseError, StatusMapBack, ValidationError } from "elysia";
import { z } from "zod";

/** The codes the HTTP layer produces itself. Domain codes (TS-27) arrive with packages/domain (TON-8). */
export type HttpProblemCode = "not_found" | "validation_failed" | "internal_error";

/** One invalid input: where it is (`query.limit`, `body.title`) and what is wrong with it. */
export const invalidParamSchema = z.object({ path: z.string(), message: z.string() });

export const problemSchema = z
  .object({
    type: z
      .string()
      .meta({ description: "`about:blank`: the status and `code` carry the meaning." }),
    title: z.string().meta({ description: "The HTTP status phrase." }),
    status: z.int(),
    detail: z.string().optional().meta({ description: "What went wrong, for people." }),
    instance: z.string().optional().meta({ description: "The request path." }),
    code: z.string().meta({ description: "Machine-readable error code (TS-27)." }),
    errors: z
      .array(invalidParamSchema)
      .optional()
      .meta({ description: "Each invalid input, for `validation_failed`." }),
  })
  .meta({ description: "RFC 9457 problem details" });

type InvalidParam = z.infer<typeof invalidParamSchema>;

const statusPhrases: Record<number, string | undefined> = StatusMapBack;

/**
 * A finished response rather than Elysia's `problem()`: for an `about:blank` problem, Elysia would swap in
 * the error's own `type` and `code` (`not-found`, `parse`).
 */
function problemFor(
  status: number,
  code: HttpProblemCode,
  instance: string,
  members: { detail?: string; errors?: InvalidParam[] } = {},
): Response {
  const body: z.input<typeof problemSchema> = {
    type: "about:blank",
    title: statusPhrases[status] ?? "Error",
    status,
    code,
    instance,
    ...members,
  };
  return Response.json(body, { status, headers: { "content-type": "application/problem+json" } });
}

/** Turns a validation issue's path into `location.key.0.key`; issue paths hold keys or `{ key }` segments. */
function issuePath(location: string | undefined, path: unknown): string {
  const segments = Array.isArray(path)
    ? path.map((segment: unknown) =>
        typeof segment === "object" && segment !== null && "key" in segment
          ? String(segment.key)
          : String(segment),
      )
    : typeof path === "string"
      ? path.split("/").filter(Boolean)
      : [];
  return [location, ...segments].filter(Boolean).join(".");
}

function invalidParams(error: ValidationError): InvalidParam[] {
  return error.all.map((issue: unknown) => {
    const isObject = typeof issue === "object" && issue !== null;
    const path = isObject && "path" in issue ? issue.path : undefined;
    const message = isObject && "message" in issue ? issue.message : undefined;
    return {
      path: issuePath(error.type, path),
      message: typeof message === "string" ? message : "Invalid value",
    };
  });
}

export type ProblemDetailsOptions = {
  /** Receives every unexpected error before it becomes a bare 500 (default: `console.error`). */
  logError?: (error: unknown, path: string) => void;
};

/**
 * Maps every error, in this app and all its plugins, to a problem. Unknown routes are `not_found`, bad input
 * (schema or unparsable body) is `validation_failed`, and anything else is a generic `internal_error`.
 *
 * Eden types: Elysia types a route with input schemas as answering 422 with its own `ValidationProblem`
 * (`code: "validation"`). Such routes declare `422: problemSchema` in their `response` map, which replaces
 * that type with what this plugin actually sends and documents it in OpenAPI.
 */
export function problemDetails({
  logError = (error, path) => console.error(`Unhandled error on ${path}`, error),
}: ProblemDetailsOptions = {}) {
  // Typed `any` on purpose: a catch-all handler with a typed return would erase every route's response
  // types for Eden (Elysia 2 beta).
  const toProblem = ({ error, path }: { error: unknown; path: string }): any => {
    if (error instanceof ValidationError && error.type !== "response") {
      return problemFor(422, "validation_failed", path, {
        detail: "The request has invalid values.",
        errors: invalidParams(error),
      });
    }
    if (error instanceof ParseError) {
      return problemFor(400, "validation_failed", path, {
        detail: "The request body could not be parsed.",
      });
    }
    if (error instanceof NotFound) {
      return problemFor(404, "not_found", path, { detail: "There is nothing at this path." });
    }
    // A response that fails its own schema is a server bug, like anything unexpected.
    logError(error, path);
    return problemFor(500, "internal_error", path);
  };

  return new Elysia({ name: "problem-details" }).onError("global", toProblem);
}
