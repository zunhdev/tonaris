// Token buckets in memory (TS-104), as the API runs as a single instance: MCP's per-connection limits (mcp/limits.ts)
// and the request limits (request-limits.ts) count with them. A bucket holds `capacity` tokens and refills them evenly
// over `refillMs`, so a burst of `capacity` passes at once, and after it `capacity` per `refillMs`.

/** `capacity` requests at once, refilled evenly over `refillMs`. */
export type BucketLimit = { capacity: number; refillMs: number };

type Bucket = { tokens: number; at: number };

/** Buckets kept before full ones are dropped, so idle keys, such as addresses, don't accumulate. */
const sweepAbove = 10_000;

/** One bucket per key, such as an account, a connection or an address. */
export class TokenBuckets {
  readonly #buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: BucketLimit,
    private readonly now: () => number = Date.now,
  ) {}

  /** Takes a token for `key`, or answers the milliseconds until one is there. A refusal takes nothing. */
  take(key: string): number | undefined {
    const at = this.now();
    const tokens = this.#tokens(key, at);
    if (tokens < 1) {
      this.#buckets.set(key, { tokens, at });
      return Math.ceil((1 - tokens) / this.#perMs);
    }
    this.#buckets.set(key, { tokens: tokens - 1, at });
    if (this.#buckets.size > sweepAbove) this.#sweep(at);
    return undefined;
  }

  get #perMs(): number {
    return this.limit.capacity / this.limit.refillMs;
  }

  /** The tokens `key` has at `at`: a new key's bucket starts full. */
  #tokens(key: string, at: number): number {
    const bucket = this.#buckets.get(key);
    if (!bucket) return this.limit.capacity;
    return Math.min(this.limit.capacity, bucket.tokens + (at - bucket.at) * this.#perMs);
  }

  /** Drops the buckets that are full again, which a new bucket would be anyway. */
  #sweep(at: number): void {
    for (const key of this.#buckets.keys()) {
      if (this.#tokens(key, at) >= this.limit.capacity) this.#buckets.delete(key);
    }
  }
}
