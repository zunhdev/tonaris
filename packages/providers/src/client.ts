// What every provider client is built from (TS-41, TS-103): the fetch, `safeFetch` in production, and the clock its
// queue keeps time by, which tests stand in for with scripted answers and a simulated clock; and how an answer's
// body is read, so that one that breaks off is the provider being unavailable (errors.ts).

import { providerNames, ProviderUnavailableError, type ProviderId } from "./errors";
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

/**
 * `response`'s body, as JSON or as text. `safeFetch`'s deadline and size limit cover the body too (TS-103), so a
 * body that breaks off, like JSON that doesn't parse, is `provider` being unavailable, never an internal error.
 * `call`, when given, says which request it answered: a path or a call's name, never a query or an id (TS-41).
 */
export function readBody(
  provider: ProviderId,
  response: Response,
  kind: "json",
  call?: string,
): Promise<unknown>;
export function readBody(
  provider: ProviderId,
  response: Response,
  kind: "text",
  call?: string,
): Promise<string>;
export async function readBody(
  provider: ProviderId,
  response: Response,
  kind: "json" | "text",
  call?: string,
): Promise<unknown> {
  try {
    return await (kind === "json" ? response.json() : response.text());
  } catch (error) {
    throw new ProviderUnavailableError(
      provider,
      `Couldn't read ${providerNames[provider]}'s answer${call === undefined ? "" : ` to ${call}`}`,
      { cause: error },
    );
  }
}
