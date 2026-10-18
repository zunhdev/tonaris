// The sign-in limits (TS-104, approved by the creator on 18 October 2026): 5 code requests per email address,
// and 20 code requests and submissions together per IP address, each per 15 minutes. Counters live in memory,
// as the API runs as a single instance. Better Auth's own limiter can't key by email and, without a trusted
// client address, puts everyone in one bucket, so it is off.

export type Limit = { max: number; windowMs: number };

const fifteenMinutes = 15 * 60_000;

export const signInLimits = {
  /** Code requests per email key: also bounds the no-account emails anyone can trigger (DS-90). */
  perEmail: { max: 5, windowMs: fifteenMinutes },
  /** Code requests and code submissions per client address. */
  perIp: { max: 20, windowMs: fifteenMinutes },
} satisfies Record<string, Limit>;

/** Hit times per key within a sliding window. */
class SlidingWindow {
  readonly #hits = new Map<string, number[]>();

  constructor(
    private readonly limit: Limit,
    private readonly now: () => number,
  ) {}

  /** Milliseconds until `key` may be counted again; 0 when it may be now. */
  waitMs(key: string): number {
    const hits = this.#current(key);
    if (hits.length < this.limit.max) return 0;
    return (hits[0] ?? 0) + this.limit.windowMs - this.now();
  }

  hit(key: string): void {
    this.#hits.set(key, [...this.#current(key), this.now()]);
  }

  /** The key's hits still in the window. Keys whose hits have all expired are dropped. */
  #current(key: string): number[] {
    const since = this.now() - this.limit.windowMs;
    const hits = (this.#hits.get(key) ?? []).filter((at) => at > since);
    if (hits.length === 0) this.#hits.delete(key);
    return hits;
  }

  /** Forgets every key with no hit in the window, so idle addresses don't accumulate. */
  sweep(): void {
    for (const key of this.#hits.keys()) this.#current(key);
  }
}

export type SignInLimiter = {
  /** Counts a code request, or returns the seconds to wait when a limit is reached; a refusal counts nothing. */
  codeRequest(emailKey: string | undefined, ip: string | undefined): number | undefined;
  /** Counts a code submission, or returns the seconds to wait. */
  codeSubmission(ip: string | undefined): number | undefined;
};

export function createSignInLimiter(
  limits: { perEmail: Limit; perIp: Limit } = signInLimits,
  now: () => number = Date.now,
): SignInLimiter {
  const byEmail = new SlidingWindow(limits.perEmail, now);
  const byIp = new SlidingWindow(limits.perIp, now);
  const sweep = setInterval(() => {
    byEmail.sweep();
    byIp.sweep();
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
  };
}
