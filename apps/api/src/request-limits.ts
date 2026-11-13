// The request limits of TS-104 beyond sign-in, captures and exports, decided by the creator on 13 November 2026:
// writes through the sync envelope, per account, and guests' views of shared links, per client address. A refused
// request does nothing and answers `429` `rate_limited` with `Retry-After` (TS-09). The web app's outbox treats a 429
// as no answer and sends the same envelopes again after a pause, so a burst is slowed, never lost (TS-22).

import { ProblemError } from "./problem";
import { type BucketLimit, TokenBuckets } from "./token-buckets";

export const requestLimits = {
  /** `POST /v1/mutations` and `POST /v1/batches` per account: a burst of 30, then 30 a second. A batch counts once. */
  mutations: { capacity: 30, refillMs: 1_000 },
  /** `GET /v1/s/{token}` and its stream per client address: 120 a minute. */
  guestViews: { capacity: 120, refillMs: 60_000 },
} as const satisfies Record<string, BucketLimit>;

export type RequestLimits = { mutations: BucketLimit; guestViews: BucketLimit };

export type RequestLimiter = {
  /** Counts one mutation request of the account's; refuses it with a 429 when over the limit. */
  mutation(accountId: string): void;
  /** Counts one guest view from `address`; refuses it with a 429 when over the limit. One without an address passes. */
  guestView(address: string | undefined): void;
};

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** The 429 for a request over its limit, with how long to wait. */
function rateLimited(waitMs: number, detail: (seconds: string) => string): ProblemError {
  const wait = seconds(waitMs);
  return new ProblemError(
    429,
    "rate_limited",
    detail(`${wait} ${wait === 1 ? "second" : "seconds"}`),
    { "retry-after": String(wait) },
  );
}

export function createRequestLimiter(
  limits: RequestLimits = requestLimits,
  now: () => number = Date.now,
): RequestLimiter {
  const mutations = new TokenBuckets(limits.mutations, now);
  const guestViews = new TokenBuckets(limits.guestViews, now);
  return {
    mutation(accountId) {
      const wait = mutations.take(accountId);
      if (wait === undefined) return;
      throw rateLimited(
        wait,
        (after) => `Too many changes at once. Nothing was saved; send them again in ${after}.`,
      );
    },
    guestView(address) {
      // In production every request has its address (TS-104); an in-process call has none to count it by.
      if (address === undefined) return;
      const wait = guestViews.take(address);
      if (wait === undefined) return;
      throw rateLimited(
        wait,
        (after) => `Too many requests for shared pages. Try again in ${after}.`,
      );
    },
  };
}

/** Limits nobody reaches: for browser and client tests, where every request comes from one address. */
export const relaxedRequestLimits: RequestLimits = {
  mutations: { capacity: 100_000, refillMs: 1_000 },
  guestViews: { capacity: 100_000, refillMs: 60_000 },
};
