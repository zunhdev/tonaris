// Sharing writes go straight to the API, online-only, with no outbox (TON-65): a fresh `mutationId`, sent once more
// with the same one if no answer came (TS-22), so a retry never does anything twice. Answers are read by the outbox's
// own rule (`refusalOf` in client/sync/transport.ts), with its 10 s wait. Eden reports a request that never reached the
// API as a 503, so that is no answer too.

import { api, type ApiClient } from "@/api";
import { refusalOf, requestTimeoutMs } from "@/client/sync/transport";
import { problemSentence } from "@/features/sync/problems";
import { unreachable } from "@/features/sync/problems";
import { useCallback, useState } from "react";

import { uuidv7, type Mutation, type MutationResult, type Outcome } from "@tonaris/domain";

/** A mutation without its ID, which `sendNow` gives it. */
export type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

/** What a send says when no answer came, even after sending again. */
export { unreachable };

/** The write's outcome from an answer, or undefined when the answer says nothing of it: the outbox's rule. */
function outcomeOf({
  data,
  error,
}: {
  data: { outcome: Outcome } | null;
  error: { status: unknown; value: unknown } | null;
}): Outcome | undefined {
  if (data) return data.outcome;
  if (!error || typeof error.status !== "number") return undefined;
  return refusalOf(error.status, error.value);
}

/** Sends `mutation`, once more with the same ID if no answer came; throws when none came either time. */
export async function sendNow(
  mutation: Unsent,
  { client = api }: { client?: ApiClient } = {},
): Promise<MutationResult["outcome"]> {
  const body = { mutationId: uuidv7(), ...mutation };
  // As long as the outbox waits for an answer, so one stalled request doesn't hold the form for minutes.
  const post = () =>
    client.v1.mutations
      .post(body, { fetch: { signal: AbortSignal.timeout(requestTimeoutMs) } })
      .then(outcomeOf, () => undefined);
  const outcome = (await post()) ?? (await post());
  if (!outcome) throw new Error("No answer from Tonaris.");
  return outcome;
}

/** The outcome's reason, if it failed: the server's sentence, or a general one. */
export const failureOf = (outcome: MutationResult["outcome"]): string | undefined =>
  outcome.status === "failed"
    ? problemSentence(outcome.problem, "That didn't work. Try again.")
    : undefined;

/**
 * Sends sharing writes for a form or a row: `run` answers the reason a write didn't go through, if it didn't, and
 * keeps it as `error` until the next one; `busy` while one is on its way.
 */
export function useSend() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(async (mutation: Unsent): Promise<string | undefined> => {
    setBusy(true);
    let reason: string | undefined;
    try {
      reason = failureOf(await sendNow(mutation));
    } catch {
      reason = unreachable;
    }
    setBusy(false);
    setError(reason);
    return reason;
  }, []);
  return { run, busy, error, setError };
}
