// What every provider client is built from (TS-41, TS-103): the fetch, `safeFetch` in production, and the clock its
// queue keeps time by. Tests stand in for both, with scripted answers and a simulated clock.

import { realClock, type Clock } from "./paced-queue";
import { safeFetch, type ProviderFetch } from "./safe-fetch";

/** The options every client takes beside its own. */
export type ClientOptions = {
  fetch?: ProviderFetch;
  /** Milliseconds since the epoch; tests pass a simulated clock with `sleep`. */
  now?: Clock["now"];
  sleep?: Clock["sleep"];
};

/** A client's fetch and clock: `safeFetch` and the real clock, unless the options stand in for them. */
export function clientParts({
  fetch = safeFetch,
  now = realClock.now,
  sleep = realClock.sleep,
}: ClientOptions): { fetch: ProviderFetch; clock: Clock } {
  return { fetch, clock: { now, sleep } };
}
