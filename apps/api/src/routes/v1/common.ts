// What the /v1 resources share (TS-09): an action's empty body, a 204's schema, the 422 refusal, and the checks that a
// principal may act on its own account or as the creator. Both checks pass only in the app (X-03): MCP tokens never
// reach /v1 (TS-62), and the policies say so again.

import { z } from "zod";

import { authorizeAdmissionAdmin, authorizeWrite, type Principal } from "@tonaris/domain";

import { ProblemError } from "../../problem";

/** An action's body: no fields, since a POST must be JSON (TS-102). */
export const noFields = z.object({}).meta({ description: "No fields." });

/** A 204's schema. Elysia sends a 204 without a body, so validation sees undefined; the document shows no content. */
export const noContent = (description: string) => z.null().optional().meta({ description });

/** A `validation_failed` refusal that says why. */
export const refused = (detail: string) => new ProblemError(422, "validation_failed", detail);

/** Changes to `ownerId`'s account settings are the account's own, in the app; `refusal` says so to anyone else. */
export function authorizeAccount(principal: Principal, ownerId: string, refusal: string): void {
  const decision = authorizeWrite(principal, { ownerId, scope: "account" });
  if (!decision.allowed) throw new ProblemError(403, "permission_denied", refusal);
}

/** Administration is the creator's, in the app only (FR-11.6, X-03): admissions, members and operations. */
export function requireCreator(principal: Principal): void {
  if (!authorizeAdmissionAdmin(principal).allowed) {
    throw new ProblemError(403, "permission_denied", "Only the creator can do this.");
  }
}
