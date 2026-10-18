// The three sign-in calls (TS-70): request a code, sign in with it, sign out. They go to the API's /auth/*
// endpoints with the session cookie, and each outcome becomes something the page can say (DS-90).

import { apiUrl } from "@/config";

export type AuthFailure =
  | { reason: "wrong_code" | "expired" | "too_many_attempts" | "invalid_email" | "unreachable" }
  | { reason: "rate_limited"; retryAfterSeconds: number }
  | { reason: "unknown" };

export type AuthResult = { ok: true } | ({ ok: false } & AuthFailure);

type PlainReason = Exclude<AuthFailure["reason"], "rate_limited">;

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
 * Better Auth answers `{ message, code }` (outside /v1, TS-04); the API's own refusals there, such as the
 * sign-in limits, are problems with a TS-27 `code`.
 */
export function authFailure(status: number, body: unknown, retryAfter: string | null): AuthFailure {
  const code =
    typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
      ? body.code
      : undefined;
  if (status === 429 || code === "rate_limited") {
    return { reason: "rate_limited", retryAfterSeconds: Math.max(1, Number(retryAfter) || 60) };
  }
  return { reason: (code && betterAuthReasons[code]) || "unknown" };
}

export function authFailureMessage(failure: AuthFailure): string {
  if (failure.reason !== "rate_limited") return messages[failure.reason];
  const minutes = Math.ceil(failure.retryAfterSeconds / 60);
  return `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

async function post(path: string, body: unknown, fetcher: typeof fetch): Promise<AuthResult> {
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
  if (response.ok) return { ok: true };
  const json: unknown = await response.json().catch(() => undefined);
  return { ok: false, ...authFailure(response.status, json, response.headers.get("retry-after")) };
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
