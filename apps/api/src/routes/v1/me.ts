// GET /v1/me: the signed-in account (FR-11.1). Clients call it to learn who is signed in, and whether they agreed to
// the current terms of use and privacy notice; POST /v1/me/terms records that they did (TON-131).

import { Elysia } from "elysia";

import { agreeToTerms, type Database } from "@tonaris/db";
import { accountSchema, problemSchema, termsAgreementSchema, termsVersion } from "@tonaris/domain";

import type { SessionGuard } from "../../auth/plugin";
import { ProblemError } from "../../problem";

export function meRoutes(session: SessionGuard, { db }: { db: Database }) {
  return new Elysia()
    .use(session)
    .get(
      "/me",
      {
        signedIn: true,
        response: { 200: accountSchema, 401: problemSchema },
        detail: {
          summary: "Get the signed-in account",
          tags: ["accounts"],
          operationId: "getMe",
        },
      },
      ({ account }) => account,
    )
    .post(
      "/me/terms",
      {
        signedIn: true,
        body: termsAgreementSchema,
        response: { 200: accountSchema, 401: problemSchema, 422: problemSchema },
        detail: {
          summary: "Agree to the terms of use and privacy notice",
          description:
            "Records that the person agreed to the version of `/terms` and `/privacy` they were shown. 422 `validation_failed` when that isn't the current version: the texts changed, so the person reads them again.",
          tags: ["accounts"],
          operationId: "agreeToTerms",
        },
      },
      async ({ account, body }) => {
        if (body.version !== termsVersion) {
          throw new ProblemError(
            422,
            "validation_failed",
            "The terms changed since this page loaded. Reload to read them.",
          );
        }
        await agreeToTerms(db, { userId: account.id }, termsVersion);
        return { ...account, termsAgreed: true };
      },
    );
}
