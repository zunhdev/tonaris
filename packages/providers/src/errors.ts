// When a provider can't be asked (TS-27, TS-90): the providers a request can fail at, each with its name as people
// read it, the error the clients throw, and the failure it becomes.
//
// One rule for every client's answers. An answer that says there is none means none: a 404, or what a client
// documents as none (Spotify's 400 for an id it can't read; YouTube's refused reads, a 400 or 403; a store page's
// 410, gone for good). iTunes Lookup says none with an empty result, so a 404 there is unexpected too. Anything
// else that isn't the answer asked for is the provider being unavailable: no answer in time, a 429, a 5xx, any other
// 4xx, or a body that breaks off (`readBody`). The provider can't answer now, so the person can try again, or enter
// the details by hand.

import type { z } from "zod";

import { failure, serviceNames, type Failure } from "@tonaris/domain";

/** Each provider a request can fail at, by the name people read it under in a failure. */
export const providerNames = {
  musicbrainz: "MusicBrainz",
  coverartarchive: "the Cover Art Archive",
  itunes: serviceNames["apple-music"],
  spotify: serviceNames.spotify,
  qobuz: serviceNames.qobuz,
  tidal: serviceNames.tidal,
  youtube: "YouTube",
} satisfies Record<string, string>;

export type ProviderId = keyof typeof providerNames;

/**
 * A provider didn't answer usefully in time: busy, unreachable or broken. The capture that asked can be retried
 * by the person, and the outcome is `provider_unavailable` (TS-27). Messages name no query (TS-41).
 */
export class ProviderUnavailableError extends Error {
  override name = "ProviderUnavailableError";
  constructor(
    readonly provider: ProviderId,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * `body` as `schema` reads it. An answer of another shape isn't the answer asked for either, so the provider is
 * unavailable, as for a 5xx, rather than the capture failing as an internal error (DRIFT-113). The parse's error is
 * the cause, for the logs.
 */
export function answerOf<T>(
  provider: ProviderId,
  schema: z.ZodType<T>,
  body: unknown,
  what = "a request",
): T {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  throw new ProviderUnavailableError(
    provider,
    `${providerNames[provider]} answered ${what} in an unexpected shape`,
    { cause: parsed.error },
  );
}

/** The failure a capture answers when `provider` can't be asked: try again, or enter the details by hand. */
export function unavailableFailure({ provider }: { provider: ProviderId }): Failure {
  return failure(
    "provider_unavailable",
    `Couldn't reach ${providerNames[provider]}. Try again, or enter the details manually.`,
  );
}
