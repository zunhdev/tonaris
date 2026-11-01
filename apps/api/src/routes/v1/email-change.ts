// Changing the sign-in email (FR-11.4, DS-93, TS-73): a code to the current address, then one to the new address,
// then the swap, which changes the email, ends the account's other sessions and writes the audit log in one
// transaction. App-only (X-03): the routes take the session cookie, and MCP tokens never reach /v1 (TS-62). Codes
// follow sign-in's rules and limits (TS-70, TS-104).

import { Elysia } from "elysia";
import { z } from "zod";

import {
  cancelEmailChange,
  type Database,
  findEmailChange,
  renewEmailChangeCode,
  startEmailChange,
  submitEmailChangeCode,
} from "@tonaris/db";
import {
  emailChangeCodeSchema,
  emailChangeRefusalDetails as refusals,
  emailChangeSchema,
  emailChangeStartSchema,
  emailChangeStepSchema,
  type EmailPort,
  parseEmailAddress,
  type Principal,
  problemSchema,
} from "@tonaris/domain";

import { clientIp, rateLimited } from "../../auth/plugin";
import type { SessionGuard } from "../../auth/plugin";
import { codeDigits, newCode, sha256 } from "../../auth/secrets";
import type { SignInLimiter } from "../../auth/sign-in-limits";
import { ProblemError } from "../../problem";
import type { SyncHub } from "../../sync/hub";
import { authorizeAccount, noContent, noFields, refused } from "./common";

export type EmailChangeDeps = {
  db: Database;
  /** Sends the codes (TS-72). */
  email: EmailPort;
  limiter: SignInLimiter;
  clientIpHeader: string | undefined;
  /** Ends the change streams of the sessions the swap ended, at once (TS-23). */
  hub: Pick<SyncHub, "endSessionsOf">;
};

const authorize = (principal: Principal, ownerId: string) =>
  authorizeAccount(principal, ownerId, "Your sign-in email is changed in the app.");

const noChange = () => new ProblemError(404, "not_found", refusals.none);

/** Why a code didn't act, as its problem. */
const submissionRefusals = {
  none: noChange,
  expired: () => new ProblemError(410, "expired", refusals.expired),
  locked: () => refused(refusals.tooManyAttempts),
  wrong: () => refused(refusals.wrongCode),
  taken: () => refused(refusals.taken),
} as const;

export function emailChangeRoutes(
  session: SessionGuard,
  { db, email, limiter, clientIpHeader, hub }: EmailChangeDeps,
) {
  return new Elysia()
    .use(session)
    .get(
      "/account/email-change",
      {
        signedIn: true,
        response: {
          200: z.object({ change: emailChangeSchema.nullable() }),
          401: problemSchema,
          403: problemSchema,
        },
        detail: {
          summary: "See the sign-in email change in progress",
          description: "The new address and the step whose code is asked for, or null (FR-11.4).",
          tags: ["accounts"],
          operationId: "getEmailChange",
        },
      },
      async ({ principal, account }) => {
        authorize(principal, account.id);
        const change = await findEmailChange(db, account.id);
        return { change: change ? { newEmail: change.newEmailKey, stage: change.stage } : null };
      },
    )
    .post(
      "/account/email-change",
      {
        signedIn: true,
        body: emailChangeStartSchema,
        response: {
          200: emailChangeSchema,
          401: problemSchema,
          403: problemSchema,
          422: problemSchema,
          429: problemSchema,
        },
        detail: {
          summary: "Start changing the sign-in email",
          description:
            "Emails a code to the current address, naming the new one. Replaces a change in progress. Refused for a non-address, the current address, or another account's (FR-11.4).",
          tags: ["accounts"],
          operationId: "startEmailChange",
        },
      },
      async ({ principal, account, body, request, server }) => {
        authorize(principal, account.id);
        const newEmail = parseEmailAddress(body.newEmail);
        if (!newEmail) throw refused(refusals.notEmail);
        if (newEmail === account.email) throw refused(refusals.same);
        const wait = limiter.codeRequest(account.email, clientIp(request, server, clientIpHeader));
        if (wait !== undefined) throw rateLimited(wait);

        const code = newCode();
        const started = await startEmailChange(db, {
          userId: account.id,
          newEmailKey: newEmail,
          codeHash: sha256(code),
        });
        if (started === "taken") throw refused(refusals.taken);
        await email.send("email-change-current", account.email, { code, newEmail });
        return { newEmail, stage: "current" as const };
      },
    )
    .post(
      "/account/email-change/verify",
      {
        signedIn: true,
        body: emailChangeCodeSchema,
        response: {
          200: emailChangeStepSchema,
          401: problemSchema,
          403: problemSchema,
          404: problemSchema,
          410: problemSchema,
          422: problemSchema,
          429: problemSchema,
        },
        detail: {
          summary: "Enter a code of the sign-in email change",
          description:
            "The current address's code emails one to the new address; the new address's code changes the email, ends the account's other sessions and records it (TS-73).",
          tags: ["accounts"],
          operationId: "verifyEmailChange",
        },
      },
      async ({ principal, account, sessionId, body, request, server }) => {
        authorize(principal, account.id);
        const wait = limiter.codeSubmission(clientIp(request, server, clientIpHeader));
        if (wait !== undefined) throw rateLimited(wait);

        const next = newCode();
        const submitted = await submitEmailChangeCode(db, {
          userId: account.id,
          sessionId,
          codeHash: sha256(codeDigits(body.code)),
          nextCodeHash: sha256(next),
          auditId: Bun.randomUUIDv7(),
        });
        if (submitted.outcome === "advanced") {
          const newEmail = submitted.change.newEmailKey;
          await email.send("email-change-new", newEmail, { code: next });
          return { stage: "new" as const, newEmail };
        }
        if (submitted.outcome === "changed") {
          hub.endSessionsOf(account.id, sessionId);
          return { stage: "done" as const, email: submitted.to };
        }
        throw submissionRefusals[submitted.outcome]();
      },
    )
    .post(
      "/account/email-change/resend",
      {
        signedIn: true,
        body: noFields,
        response: {
          200: emailChangeSchema,
          401: problemSchema,
          403: problemSchema,
          404: problemSchema,
          422: problemSchema,
          429: problemSchema,
        },
        detail: {
          summary: "Send the step's code again",
          description: "A new code for the step in progress; the earlier one stops working.",
          tags: ["accounts"],
          operationId: "resendEmailChangeCode",
        },
      },
      async ({ principal, account, request, server }) => {
        authorize(principal, account.id);
        const change = await findEmailChange(db, account.id);
        if (!change) throw noChange();
        const to = change.stage === "current" ? account.email : change.newEmailKey;
        const wait = limiter.codeRequest(to, clientIp(request, server, clientIpHeader));
        if (wait !== undefined) throw rateLimited(wait);

        const code = newCode();
        const renewed = await renewEmailChangeCode(db, {
          userId: account.id,
          codeHash: sha256(code),
        });
        if (!renewed) throw noChange();
        const newEmail = renewed.newEmailKey;
        await (renewed.stage === "current"
          ? email.send("email-change-current", to, { code, newEmail })
          : email.send("email-change-new", to, { code }));
        return { newEmail, stage: renewed.stage };
      },
    )
    .delete(
      "/account/email-change",
      {
        signedIn: true,
        response: {
          204: noContent("Nothing is changing any more."),
          401: problemSchema,
          403: problemSchema,
        },
        detail: {
          summary: "Cancel the sign-in email change",
          description: "The email stays as it was, and the codes sent stop working.",
          tags: ["accounts"],
          operationId: "cancelEmailChange",
        },
      },
      async ({ principal, account, status }) => {
        authorize(principal, account.id);
        await cancelEmailChange(db, account.id);
        return status(204, null);
      },
    );
}
