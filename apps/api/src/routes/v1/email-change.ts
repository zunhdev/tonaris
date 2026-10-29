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
  authorizeWrite,
  emailChangeCodeSchema,
  emailChangeRefusalDetails as refusals,
  emailChangeSchema,
  emailChangeStartSchema,
  emailChangeStepSchema,
  emailKey,
  type EmailPort,
  type Principal,
  problemSchema,
  signInCode,
} from "@tonaris/domain";

import { clientIp, rateLimited } from "../../auth/plugin";
import type { SessionGuard } from "../../auth/plugin";
import type { SignInLimiter } from "../../auth/sign-in-limits";
import { ProblemError } from "../../problem";

export type EmailChangeDeps = {
  db: Database;
  /** Sends the codes (TS-72). */
  email: EmailPort;
  limiter: SignInLimiter;
  clientIpHeader: string | undefined;
};

/** The largest multiple of 1,000,000 below 2^32: values from it up would favour the low codes. */
const unbiasedLimit = 4_294_000_000;

/** Six random digits, like a sign-in code. */
export function newEmailChangeCode(): string {
  let value: number;
  do [value = unbiasedLimit] = crypto.getRandomValues(new Uint32Array(1));
  while (value >= unbiasedLimit);
  return String(value % 10 ** signInCode.length).padStart(signInCode.length, "0");
}

/** What the database keeps of a code: its SHA-256. */
const codeHash = (code: string) => new Bun.CryptoHasher("sha256").update(code).digest();

function authorize(principal: Principal, ownerId: string): void {
  const decision = authorizeWrite(principal, { ownerId, scope: "account" });
  if (!decision.allowed) {
    throw new ProblemError(403, "permission_denied", "Your sign-in email is changed in the app.");
  }
}

const refused = (detail: string) => new ProblemError(422, "validation_failed", detail);
const noChange = () => new ProblemError(404, "not_found", refusals.none);

/** Why a code didn't act, as its problem. */
const submissionRefusals = {
  none: noChange,
  expired: () => new ProblemError(410, "expired", refusals.expired),
  locked: () => refused(refusals.tooManyAttempts),
  wrong: () => refused(refusals.wrongCode),
  taken: () => refused(refusals.taken),
} as const;

/** An action's body: no fields, since a POST must be JSON (TS-102). */
const noFields = z.object({}).meta({ description: "No fields." });

export function emailChangeRoutes(
  session: SessionGuard,
  { db, email, limiter, clientIpHeader }: EmailChangeDeps,
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
        const newEmail = emailKey(body.newEmail);
        if (!z.email().safeParse(newEmail).success) throw refused(refusals.notEmail);
        if (newEmail === account.email) throw refused(refusals.same);
        const wait = limiter.codeRequest(account.email, clientIp(request, server, clientIpHeader));
        if (wait !== undefined) throw rateLimited(wait);

        const code = newEmailChangeCode();
        const started = await startEmailChange(db, {
          userId: account.id,
          newEmailKey: newEmail,
          codeHash: codeHash(code),
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

        const next = newEmailChangeCode();
        const submitted = await submitEmailChangeCode(db, {
          userId: account.id,
          sessionId,
          // Pasted codes may carry spaces or a dash; only the digits count.
          codeHash: codeHash(body.code.replaceAll(/\D/g, "")),
          nextCodeHash: codeHash(next),
          auditId: Bun.randomUUIDv7(),
        });
        if (submitted.outcome === "advanced") {
          const newEmail = submitted.change.newEmailKey;
          await email.send("email-change-new", newEmail, { code: next });
          return { stage: "new" as const, newEmail };
        }
        if (submitted.outcome === "changed") return { stage: "done" as const, email: submitted.to };
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

        const code = newEmailChangeCode();
        const renewed = await renewEmailChangeCode(db, {
          userId: account.id,
          codeHash: codeHash(code),
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
          // Elysia sends a 204 without a body, so validation sees undefined; the document shows no content.
          204: z.null().optional().meta({ description: "Nothing is changing any more." }),
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
