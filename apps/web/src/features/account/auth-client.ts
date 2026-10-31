// The sign-in calls (TS-70): request a code, sign in with it, sign out; a passkey's ceremonies, to sign in with one
// and to add one (TON-143); and joining with an invitation (TS-71): look it up, request a code, join. They go to the
// API's /auth/* endpoints with the session cookie, and each outcome becomes something the page can say (DS-90,
// DS-91, DS-93).

import { apiUrl } from "@/config";
import {
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
  WebAuthnError,
} from "@simplewebauthn/browser";

export type AuthFailure =
  | { reason: "wrong_code" | "expired" | "too_many_attempts" | "invalid_email" | "unreachable" }
  /** A passkey's ceremony: one that doesn't verify the person, one no account has, or one that failed. */
  | { reason: "passkey_unverified" | "passkey_unknown" | "passkey_failed" | "passkey_exists" }
  /** The person closed the browser's passkey prompt, or another ceremony replaced it: nothing to say. */
  | { reason: "cancelled" }
  /** Adding a passkey needs a session from the last day (TON-143). */
  | { reason: "not_fresh" }
  | { reason: "rate_limited"; retryAfterSeconds: number }
  /** A refusal the API explains, such as an invitation that can't be used (DS-91), with its sentence. */
  | { reason: "refused"; detail: string }
  | { reason: "unknown" };

export type AuthResult = { ok: true } | ({ ok: false } & AuthFailure);

type PlainReason = Exclude<AuthFailure["reason"], "rate_limited" | "refused">;

/** Better Auth's error codes (the email OTP and passkey plugins) that the sign-in pages explain. */
const betterAuthReasons: Partial<Record<string, PlainReason>> = {
  INVALID_OTP: "wrong_code",
  OTP_EXPIRED: "expired",
  TOO_MANY_ATTEMPTS: "too_many_attempts",
  INVALID_EMAIL: "invalid_email",
  USER_VERIFICATION_REQUIRED: "passkey_unverified",
  PASSKEY_NOT_FOUND: "passkey_unknown",
  AUTHENTICATION_FAILED: "passkey_failed",
  CHALLENGE_NOT_FOUND: "passkey_failed",
  FAILED_TO_VERIFY_REGISTRATION: "passkey_failed",
  SESSION_NOT_FRESH: "not_fresh",
};

const messages: Record<PlainReason, string> = {
  wrong_code: "That code isn't right. Check the email and try again.",
  expired: "This code has expired. Send a new code.",
  too_many_attempts: "Too many wrong codes. Send a new code.",
  invalid_email: "Enter a valid email address.",
  unreachable: "Couldn't reach Tonaris. Check your connection and try again.",
  passkey_unverified:
    "That passkey doesn't ask for your face, fingerprint or PIN, so Tonaris can't use it.",
  passkey_unknown:
    "This passkey isn't on a Tonaris account anymore. Sign in with an email code, and remove it from your password manager.",
  passkey_failed: "That passkey didn't work. Try again.",
  passkey_exists: "This device already has a passkey for your account.",
  cancelled: "",
  not_fresh: "To add a passkey, confirm it's you first.",
  unknown: "Something went wrong. Try again.",
};

/**
 * The statuses of refusals the API explains: an invitation unknown, expired, or revoked, used or paused (TS-71); a
 * recovery link unknown or expired, or its code wrong (TS-73).
 */
const refusalStatuses = new Set([403, 404, 410, 422]);

/** `body[key]`, when `body` is an object and that is a string. */
function textOf(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value: unknown = Reflect.get(body, key);
  return typeof value === "string" ? value : undefined;
}

/**
 * Better Auth answers `{ message, code }` (outside /v1, TS-04); the API's own refusals there, such as the
 * sign-in limits and an invitation that can't be used, are problems with a TS-27 `code` and a `detail`.
 */
export function authFailure(status: number, body: unknown, retryAfter: string | null): AuthFailure {
  const code = textOf(body, "code");
  if (status === 429 || code === "rate_limited") {
    return { reason: "rate_limited", retryAfterSeconds: Math.max(1, Number(retryAfter) || 60) };
  }
  const reason = code && betterAuthReasons[code];
  if (reason) return { reason };
  const detail = textOf(body, "detail");
  if (refusalStatuses.has(status) && detail) return { reason: "refused", detail };
  return { reason: "unknown" };
}

export function authFailureMessage(failure: AuthFailure): string {
  if (failure.reason === "refused") return failure.detail;
  if (failure.reason !== "rate_limited") return messages[failure.reason];
  const minutes = Math.ceil(failure.retryAfterSeconds / 60);
  return `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** Posts `body` to `/auth{path}`, or GETs it without one, answering the response's JSON or the failure. */
async function call(
  path: string,
  body: unknown,
  fetcher: typeof fetch,
): Promise<{ ok: true; json: unknown } | ({ ok: false } & AuthFailure)> {
  let response: Response;
  try {
    response = await fetcher(
      `${apiUrl}/auth${path}`,
      body === undefined
        ? { credentials: "include" }
        : {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  const json: unknown = await response.json().catch(() => undefined);
  if (response.ok) return { ok: true, json };
  return { ok: false, ...authFailure(response.status, json, response.headers.get("retry-after")) };
}

async function post(path: string, body: unknown, fetcher: typeof fetch): Promise<AuthResult> {
  const result = await call(path, body, fetcher);
  return result.ok ? { ok: true } : result;
}

/** Emails a code to `email`; the API answers the same whether or not it has an account (DS-90). */
export function requestSignInCode(
  email: string,
  fetcher: typeof fetch = fetch,
): Promise<AuthResult> {
  return post("/email-otp/send-verification-otp", { email, type: "sign-in" }, fetcher);
}

/** Signs in with the emailed code; the API sets the session cookie. */
export function signInWithCode(
  email: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<AuthResult> {
  return post("/sign-in/email-otp", { email, otp: code }, fetcher);
}

export function signOut(fetcher: typeof fetch = fetch): Promise<AuthResult> {
  return post("/sign-out", {}, fetcher);
}

/**
 * What the browser's passkey prompt ended with, when it didn't give a passkey: the person closed it, another
 * ceremony replaced it, or this device already holds one for the account.
 */
function ceremonyFailure(error: unknown): AuthFailure {
  if (error instanceof WebAuthnError) {
    if (error.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
      return { reason: "passkey_exists" };
    if (error.code === "ERROR_CEREMONY_ABORTED") return { reason: "cancelled" };
    if (error.cause instanceof Error && error.cause.name === "NotAllowedError") {
      return { reason: "cancelled" };
    }
  }
  if (error instanceof Error && ["NotAllowedError", "AbortError"].includes(error.name)) {
    return { reason: "cancelled" };
  }
  return { reason: "passkey_failed" };
}

/** Sign-in options from the API, which SimpleWebAuthn's server side made: a challenge at least. */
function isRequestOptions(value: unknown): value is PublicKeyCredentialRequestOptionsJSON {
  return textOf(value, "challenge") !== undefined;
}

/** Registration options from the API: a challenge, the relying party and the account. */
function isCreationOptions(value: unknown): value is PublicKeyCredentialCreationOptionsJSON {
  return isRequestOptions(value) && "rp" in value && "user" in value && "pubKeyCredParams" in value;
}

/**
 * Signs in with a passkey (TON-143); the API sets the session cookie. With `autofill`, the browser offers saved
 * passkeys in the email field instead of asking at once, and the promise waits until one is chosen.
 */
export async function signInWithPasskey({
  autofill = false,
  fetcher = fetch,
}: { autofill?: boolean; fetcher?: typeof fetch } = {}): Promise<AuthResult> {
  const options = await call("/passkey/generate-authenticate-options", undefined, fetcher);
  if (!options.ok) return options;
  if (!isRequestOptions(options.json)) return { ok: false, reason: "unknown" };
  let response: unknown;
  try {
    response = await startAuthentication({
      optionsJSON: options.json,
      useBrowserAutofill: autofill,
    });
  } catch (error) {
    return { ok: false, ...ceremonyFailure(error) };
  }
  return post("/passkey/verify-authentication", { response }, fetcher);
}

/** Stops a passkey ceremony waiting in the email field's autofill, as the page leaves. */
export function cancelPasskeyPrompt(): void {
  WebAuthnAbortService.cancelCeremony();
}

/**
 * Adds a passkey to the signed-in account (TON-143). It needs a session from the last day, else `not_fresh`; the
 * API names the passkey and emails the account's address.
 */
export async function addPasskey(fetcher: typeof fetch = fetch): Promise<AuthResult> {
  const options = await call("/passkey/generate-register-options", undefined, fetcher);
  if (!options.ok) return options;
  if (!isCreationOptions(options.json)) return { ok: false, reason: "unknown" };
  let response: unknown;
  try {
    response = await startRegistration({ optionsJSON: options.json });
  } catch (error) {
    return { ok: false, ...ceremonyFailure(error) };
  }
  return post("/passkey/verify-registration", { response }, fetcher);
}

/** The address an invitation is bound to, for its landing (DS-91), or why it can't be used. Sends nothing. */
export async function lookUpInvitation(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; email: string } | ({ ok: false } & AuthFailure)> {
  const result = await call("/admission/invitation", { token }, fetcher);
  if (!result.ok) return result;
  const email = textOf(result.json, "email");
  return email ? { ok: true, email } : { ok: false, reason: "unknown" };
}

/** Emails a code to the invitation's address. */
export function requestJoinCode(token: string, fetcher: typeof fetch = fetch): Promise<AuthResult> {
  return post("/admission/code", { token }, fetcher);
}

/** Creates the invited person's account with the emailed code; the API sets the session cookie. */
export function joinWithCode(
  token: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<AuthResult> {
  return post("/admission/join", { token, otp: code }, fetcher);
}

/** Confirms the creator's recovery with its link's token and code (TS-73); answers the new sign-in email. */
export async function confirmRecovery(
  token: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; email: string } | ({ ok: false } & AuthFailure)> {
  const result = await call("/recovery/confirm", { token, code }, fetcher);
  if (!result.ok) return result;
  const email = textOf(result.json, "email");
  return email ? { ok: true, email } : { ok: false, reason: "unknown" };
}

/** An account deletion's progress (TS-74), asked with its token once the session is gone. */
export type DeletionProgress =
  | { ok: true; status: "deleting" | "deleted" | "failed" }
  | ({ ok: false } & AuthFailure);

const deletionStatuses = new Set(["deleting", "deleted", "failed"] as const);

async function deletionCall(
  path: string,
  token: string,
  fetcher: typeof fetch,
): Promise<DeletionProgress> {
  const result = await call(path, { token }, fetcher);
  if (!result.ok) return result;
  const status = [...deletionStatuses].find((each) => each === textOf(result.json, "status"));
  return status ? { ok: true, status } : { ok: false, reason: "unknown" };
}

export function deletionProgress(token: string, fetcher: typeof fetch = fetch) {
  return deletionCall("/account-deletion/progress", token, fetcher);
}

/** Queues a failed deletion again (DS-97's Retry). */
export function retryDeletion(token: string, fetcher: typeof fetch = fetch) {
  return deletionCall("/account-deletion/retry", token, fetcher);
}
