// Invite-only account creation (FR-11.2, FR-11.6, TS-71). The invitation link's token finds the invitation, and a
// code sent to its address proves the person has that address. Then one transaction checks that admissions are
// open and the invitation is available, creates the account, redeems the invitation, and signs in through Better
// Auth, which consumes the code and creates the session. All of it commits, or none of it does.

import { Elysia } from "elysia";
import { z } from "zod";

import {
  admitAccount,
  admissionsPaused,
  type AdmissionInvitationRow,
  type Database,
  findAdmissionInvitation,
  insertAdmissionInvitation,
} from "@tonaris/db";
import {
  admissionInvitationDays,
  admissionRefusalDetails,
  type AdmissionRefusal,
  emailKey,
  type EmailPort,
  invitationStatus,
  joinCodeRequestSchema,
  joinSchema,
} from "@tonaris/domain";

import type { ApiConfig } from "../config";
import { ProblemError } from "../problem";
import type { Auth } from "./auth";
import { clientIp, rateLimited } from "./plugin";
import type { SignInLimiter } from "./sign-in-limits";
import { inAuthTransaction } from "./transaction";

const day = 24 * 60 * 60_000;

/** What the database keeps of an invitation's token: its SHA-256. */
export function admissionTokenHash(token: string): Buffer {
  return new Bun.CryptoHasher("sha256").update(token).digest();
}

/**
 * Issues an invitation for `email`, valid for 14 days, and returns the link's token, which is stored only as its
 * hash. The creator's admin (TON-74) sends it; tests and fixtures call it directly.
 */
export async function issueAdmissionInvitation(
  db: Database,
  { email, createdBy, now = new Date() }: { email: string; createdBy: string; now?: Date },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const id = Bun.randomUUIDv7();
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const expiresAt = new Date(now.getTime() + admissionInvitationDays * day);
  await insertAdmissionInvitation(db, {
    id,
    emailKey: emailKey(email),
    tokenHash: admissionTokenHash(token),
    expiresAt,
    createdBy,
  });
  return { id, token, expiresAt };
}

/** The invitation page (DS-91), which submits the code in the fragment, so it reaches no server log. */
export function joinLink(webOrigin: string, token: string, code: string): string {
  return `${webOrigin}/join/${encodeURIComponent(token)}#code=${code}`;
}

const refusalStatuses: Record<
  AdmissionRefusal,
  [number, "not_found" | "expired" | "permission_denied"]
> = {
  invalid: [404, "not_found"],
  expired: [410, "expired"],
  revoked: [403, "permission_denied"],
  redeemed: [403, "permission_denied"],
  paused: [403, "permission_denied"],
};

function refused(refusal: AdmissionRefusal): ProblemError {
  const [status, code] = refusalStatuses[refusal];
  return new ProblemError(status, code, admissionRefusalDetails[refusal]);
}

/** Why `invitation` can't create an account now, if it can't. */
async function refusalOf(
  db: Database,
  invitation: AdmissionInvitationRow | undefined,
): Promise<AdmissionRefusal | undefined> {
  if (!invitation) return "invalid";
  const status = invitationStatus(invitation);
  if (status !== "available") return status;
  if (await admissionsPaused(db)) return "paused";
  return undefined;
}

/** The body of Better Auth's error responses. */
const betterAuthError = z.object({ code: z.string() });

/** Thrown inside the admission's transaction to roll it back with this outcome. */
class Rollback extends Error {
  constructor(readonly outcome: AdmissionRefusal | "registered" | Response) {
    super("admission rolled back");
  }
}

export type AdmissionRoutesOptions = {
  auth: Auth;
  db: Database;
  config: ApiConfig;
  email: EmailPort;
  limiter: SignInLimiter;
  logError: (error: unknown, context: string) => void;
};

/**
 * `POST /auth/admission/code` emails a code to the invitation's address, and `POST /auth/admission/join` creates
 * the account with it and signs in. They sit beside Better Auth's sign-in endpoints and answer like them: the
 * session cookie on success, and Better Auth's error for a wrong, expired or used-up code (DS-90).
 */
export function admissionRoutes({
  auth,
  db,
  config,
  email,
  limiter,
  logError,
}: AdmissionRoutesOptions) {
  return new Elysia()
    .post(
      "/auth/admission/code",
      {
        body: joinCodeRequestSchema,
        response: { 200: z.object({ email: z.string() }) },
        detail: { hide: true },
      },
      async ({ body, request, server }) => {
        const invitation = await findAdmissionInvitation(db, admissionTokenHash(body.token));
        const ip = clientIp(request, server, config.clientIpHeader);
        const wait = limiter.codeRequest(invitation?.emailKey, ip);
        if (wait !== undefined) throw rateLimited(wait);
        const refusal = await refusalOf(db, invitation);
        if (refusal || !invitation) throw refused(refusal ?? "invalid");

        const address = invitation.emailKey;
        // A sign-in code, so Better Auth's sign-in can consume it when the account is created.
        const code = await auth.api.createVerificationOTP({
          body: { email: address, type: "sign-in" },
        });
        // Sent after the response, as sign-in codes are (TS-72).
        void email
          .send("join-code", address, { code, link: joinLink(config.webOrigin, body.token, code) })
          .catch((error: unknown) => logError(error, "join code email"));
        return { email: address };
      },
    )
    .post(
      "/auth/admission/join",
      { body: joinSchema, detail: { hide: true } },
      async ({ body, request, server }) => {
        const wait = limiter.codeSubmission(clientIp(request, server, config.clientIpHeader));
        if (wait !== undefined) throw rateLimited(wait);
        const invitation = await findAdmissionInvitation(db, admissionTokenHash(body.token));
        if (!invitation) throw refused("invalid");

        const address = invitation.emailKey;
        const signIn = () =>
          auth.api.signInEmailOTP({
            body: { email: address, otp: body.otp },
            headers: request.headers,
            asResponse: true,
          });

        // The code is checked first, outside the transaction, so a wrong guess counts even though the
        // transaction would roll back (TS-70: 5 attempts). The check doesn't consume a right code.
        const checked = await auth.api.checkVerificationOTP({
          body: { email: address, type: "sign-in", otp: body.otp },
          asResponse: true,
        });
        // An account has the address already: its owner signs in, as on the sign-in page (FR-11.2).
        if (checked.ok) return signIn();
        const failure = betterAuthError.safeParse(await checked.clone().json());
        if (failure.data?.code !== "USER_NOT_FOUND") return checked;

        // The code is right, and no account has the address.
        try {
          return await inAuthTransaction(auth, async (tx) => {
            const admission = await admitAccount(tx, {
              invitationId: invitation.id,
              userId: Bun.randomUUIDv7(),
            });
            if (!admission.admitted) throw new Rollback(admission.refusal);
            // Consumes the code and creates the session in this transaction. It fails only if a concurrent
            // request used the code first; then the account isn't created either.
            const signedIn = await signIn();
            if (!signedIn.ok) throw new Rollback(signedIn);
            return signedIn;
          });
        } catch (error) {
          if (!(error instanceof Rollback)) throw error;
          if (error.outcome instanceof Response) return error.outcome;
          // An account got the address meanwhile; the code is still unused, so its owner signs in.
          if (error.outcome === "registered") return signIn();
          throw refused(error.outcome);
        }
      },
    );
}
