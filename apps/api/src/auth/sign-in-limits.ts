// The sign-in limits (TS-104, approved by the creator on 18 October 2026): 5 code requests per email address,
// and 20 code requests and submissions together per IP address, each per 15 minutes. A passkey sign-in's start
// and finish count as submissions (TON-143, decided 31 October 2026). Counters live in memory,
// as the API runs as a single instance. Better Auth's own limiter can't key by email and, without a trusted
// client address, puts everyone in one bucket, so it is off.
// The same limiter bounds open client registration for MCP (DCR, TS-61): 10 per IP address per hour, proposed
// in TON-22 and approved by the creator on 29 October 2026 (TON-80).

import { type Limit, SlidingWindow } from "../sliding-window";

const fifteenMinutes = 15 * 60_000;

export const signInLimits = {
  /** Code requests per email key: also bounds the no-account emails anyone can trigger (DS-90). */
  perEmail: { max: 5, windowMs: fifteenMinutes },
  /** Code requests, code submissions and passkey sign-in steps per client address. */
  perIp: { max: 20, windowMs: fifteenMinutes },
} satisfies Record<string, Limit>;

/** Dynamic client registrations per client address (TS-61). Claude, ChatGPT and Codex use CIMD instead. */
export const registrationLimit: Limit = { max: 10, windowMs: 60 * 60_000 };

export type SignInLimiter = {
  /** Counts a code request, or returns the seconds to wait when a limit is reached; a refusal counts nothing. */
  codeRequest(emailKey: string | undefined, ip: string | undefined): number | undefined;
  /** Counts a code submission, or a passkey sign-in's start or finish, or returns the seconds to wait. */
  codeSubmission(ip: string | undefined): number | undefined;
  /** Counts a dynamic client registration, or returns the seconds to wait. */
  clientRegistration(ip: string | undefined): number | undefined;
};

export function createSignInLimiter(
  limits: { perEmail: Limit; perIp: Limit } = signInLimits,
  now: () => number = Date.now,
  registrations: Limit = registrationLimit,
): SignInLimiter {
  const byEmail = new SlidingWindow(limits.perEmail, now);
  const byIp = new SlidingWindow(limits.perIp, now);
  const registrationsByIp = new SlidingWindow(registrations, now);
  const sweep = setInterval(() => {
    byEmail.sweep();
    byIp.sweep();
    registrationsByIp.sweep();
  }, fifteenMinutes);
  sweep.unref();

  const take = (entries: [SlidingWindow, string | undefined][]): number | undefined => {
    const counted = entries.filter(
      (entry): entry is [SlidingWindow, string] => entry[1] !== undefined,
    );
    const waitMs = Math.max(0, ...counted.map(([window, key]) => window.waitMs(key)));
    if (waitMs > 0) return Math.ceil(waitMs / 1000);
    for (const [window, key] of counted) window.hit(key);
    return undefined;
  };

  return {
    codeRequest: (emailKey, ip) =>
      take([
        [byEmail, emailKey],
        [byIp, ip],
      ]),
    codeSubmission: (ip) => take([[byIp, ip]]),
    clientRegistration: (ip) => take([[registrationsByIp, ip]]),
  };
}
