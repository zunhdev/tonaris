// The sign-in calls (TS-70): request a code, sign in with it, sign out; and joining with an invitation (TS-71):
// look it up, request a code, join. They go to the API's /auth/* endpoints with the session cookie, and each
// outcome becomes something the page can say (DS-90, DS-91).

import { apiUrl } from "@/config";

export type AuthFailure =
  | { reason: "wrong_code" | "expired" | "too_many_attempts" | "invalid_email" | "unreachable" }
  | { reason: "rate_limited"; retryAfterSeconds: number }
  /** A refusal the API explains, such as an invitation that can't be used (DS-91), with its sentence. */
  | { reason: "refused"; detail: string }
  | { reason: "unknown" };

export type AuthResult = { ok: true } | ({ ok: false } & AuthFailure);

type PlainReason = Exclude<AuthFailure["reason"], "rate_limited" | "refused">;

/** Better Auth's error codes (email OTP plugin) that the sign-in pages explain. */
const betterAuthReasons: Partial<Record<string, PlainReason>> = {
  INVALID_OTP: "wrong_code",
  OTP_EXPIRED: "expired",
  TOO_MANY_ATTEMPTS: "too_many_attempts",
  INVALID_EMAIL: "invalid_email",
};

const messages: Record<PlainReason, string> = {
  wrong_code: "That code isn't right. Check the email and try again.",
  expired: "This code has expired. Send a new code.",
  too_many_attempts: "Too many wrong codes. Send a new code.",
  invalid_email: "Enter a valid email address.",
  unreachable: "Couldn't reach Tonaris. Check your connection and try again.",
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

/** Posts `body` to `/auth{path}`, answering the response's JSON or the failure. */
async function call(
  path: string,
  body: unknown,
  fetcher: typeof fetch,
): Promise<{ ok: true; json: unknown } | ({ ok: false } & AuthFailure)> {
  let response: Response;
  try {
    response = await fetcher(`${apiUrl}/auth${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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
