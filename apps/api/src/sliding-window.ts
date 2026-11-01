// Counting in a sliding window, in memory, as the API runs as a single instance (TS-104): the sign-in limits
// (auth/sign-in-limits.ts) and the export limit (TS-80) count with it.

/** At most `max` hits per key in any `windowMs`. */
export type Limit = { max: number; windowMs: number };

/** Hit times per key within a sliding window. */
export class SlidingWindow {
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
