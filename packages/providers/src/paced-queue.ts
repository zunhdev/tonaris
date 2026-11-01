// Turn-taking for providers with a request rate (TS-41): MusicBrainz's 1 a second, iTunes Lookup's 20 a minute,
// and the polite pace of Spotify, the store pages and YouTube's Data API. Turns are taken in the order asked for
// and start at least `intervalMs` apart, start to start; a turn passes once its request starts, so a slow answer
// holds nobody up.

export type Clock = {
  /** Milliseconds since the epoch. */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export const realClock: Clock = {
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * How long a busy answer holds the queue before retry number `retry` (from 0): the seconds `Retry-After` asks for,
 * or 2^`retry` seconds when that is longer (TS-41).
 */
export function retryAfterMs(retryAfter: string | null, retry: number): number {
  return Math.max(Number(retryAfter) || 0, 2 ** retry) * 1_000;
}

export class PacedQueue {
  /** The end of the queue: each turn waits for the one before it. */
  private queue: Promise<void> = Promise.resolve();
  /** When the next turn may start, moved on by each start and by every hold. */
  private nextStart = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly clock: Clock = realClock,
  ) {}

  /** Waits for this request's turn. */
  turn(): Promise<void> {
    const turn = this.startAfter(this.queue);
    // A turn never fails, but the chain mustn't break if one did.
    this.queue = turn.catch(() => {});
    return turn;
  }

  /** Holds every waiting turn back until at least `ms` from now, as a provider's busy answer asks. */
  holdFor(ms: number): void {
    this.nextStart = Math.max(this.nextStart, this.clock.now() + ms);
  }

  /** Waits for the turn before, then for the start time, and marks when the next may start. */
  private async startAfter(previous: Promise<void>): Promise<void> {
    await previous;
    // A hold can move the start on while this turn sleeps, so it looks again after each sleep.
    for (
      let wait = this.nextStart - this.clock.now();
      wait > 0;
      wait = this.nextStart - this.clock.now()
    ) {
      // oxlint-disable-next-line no-await-in-loop
      await this.clock.sleep(wait);
    }
    this.nextStart = this.clock.now() + this.intervalMs;
  }
}
