// Sharing writes go straight to the API, online-only, with no outbox (TON-65): a fresh `mutationId`, sent once more
// with the same one if no answer came (TS-22), so a retry never does anything twice. As the outbox's transport has it
// (client/sync/transport.ts), a refusal with a problem (4xx) was judged, so it is that write's failed outcome; no
// answer, a 5xx, a 408 or a 429 says nothing of whether it ran. Eden reports a request that never reached the API as
// a 503, so that is no answer too.

import { api, type ApiClient } from "@/api";
import { problemSentence } from "@/features/sync/problems";
import { useCallback, useState } from "react";

import {
  problemSchema,
  uuidv7,
  type Mutation,
  type MutationResult,
  type Outcome,
} from "@tonaris/domain";

/** A mutation without its ID, which `sendNow` gives it. */
export type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

/** What a send says when no answer came, even after sending again. */
export const unreachable = "Couldn't reach Tonaris. Try again.";

/** Statuses that say nothing about whether the write ran. */
const unknownOutcome = new Set([408, 429]);

/** The write's outcome from an answer, or undefined when the answer says nothing of it. */
function outcomeOf({
  data,
  error,
}: {
  data: { outcome: Outcome } | null;
  error: { status: unknown; value: unknown } | null;
}): Outcome | undefined {
  if (data) return data.outcome;
  if (!error || typeof error.status !== "number") return undefined;
  if (error.status < 400 || error.status >= 500 || unknownOutcome.has(error.status)) {
    return undefined;
  }
  const problem = problemSchema.safeParse(error.value);
  return problem.success
    ? { status: "failed", code: problem.data.code, problem: problem.data }
    : undefined;
}

/** Sends `mutation`, once more with the same ID if no answer came; throws when none came either time. */
export async function sendNow(
  mutation: Unsent,
  { client = api }: { client?: ApiClient } = {},
): Promise<MutationResult["outcome"]> {
  const body = { mutationId: uuidv7(), ...mutation };
  const post = () => client.v1.mutations.post(body).then(outcomeOf, () => undefined);
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
