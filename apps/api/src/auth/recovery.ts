// Confirming the creator's recovery of a sign-in email (FR-11.5, TS-73): the new address's email links to
// `/recover/:token#code=…`, and its page posts the token and code here. The person isn't signed in, since they
// lost the old address, so the route sits beside sign-in's, with its submission limit (TS-104). Confirming swaps
// the email, ends every session of the account, and writes the audit log; they then sign in with the new address.

import { Elysia } from "elysia";
import { z } from "zod";

import { confirmEmailRecovery, type Database } from "@tonaris/db";
import {
  emailRecoveryConfirmSchema,
  emailRecoveryRefusalDetails as refusals,
} from "@tonaris/domain";

import { ProblemError } from "../problem";
import type { SyncHub } from "../sync/hub";
import { clientIp, rateLimited } from "./plugin";
import { codeDigits, sha256 } from "./secrets";
import type { SignInLimiter } from "./sign-in-limits";

/** The confirmation page, with the code in the fragment, so it reaches no server log. */
export function recoveryLink(webOrigin: string, token: string, code: string): string {
  return `${webOrigin}/recover/${encodeURIComponent(token)}#code=${code}`;
}

/** Why a confirmation didn't move the account, as its problem. */
const confirmationRefusals = {
  none: () => new ProblemError(404, "not_found", refusals.invalid),
  expired: () => new ProblemError(410, "expired", refusals.expired),
  locked: () => new ProblemError(422, "validation_failed", refusals.tooManyAttempts),
  wrong: () => new ProblemError(422, "validation_failed", refusals.wrongCode),
  taken: () => new ProblemError(422, "validation_failed", refusals.taken),
} as const;

export function recoveryRoutes({
  db,
  limiter,
  clientIpHeader,
  hub,
}: {
  db: Database;
  limiter: SignInLimiter;
  clientIpHeader: string | undefined;
  /** Ends the account's change streams at once, with its sessions (TS-23). */
  hub: Pick<SyncHub, "endSessionsOf">;
}) {
  return new Elysia().post(
    "/auth/recovery/confirm",
    {
      body: emailRecoveryConfirmSchema,
      response: { 200: z.object({ email: z.string() }) },
      detail: { hide: true },
    },
    async ({ body, request, server }) => {
      const wait = limiter.codeSubmission(clientIp(request, server, clientIpHeader));
      if (wait !== undefined) throw rateLimited(wait);
      const confirmed = await confirmEmailRecovery(db, {
        tokenHash: sha256(body.token),
        codeHash: sha256(codeDigits(body.code)),
        auditId: Bun.randomUUIDv7(),
      });
      if (confirmed.outcome === "recovered") {
        hub.endSessionsOf(confirmed.userId);
        return { email: confirmed.to };
      }
      throw confirmationRefusals[confirmed.outcome]();
    },
  );
}
