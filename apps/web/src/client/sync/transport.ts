// Sends one mutation envelope (TS-20) and tells an answer from no answer. A 200 carries the stored outcome. A
// refusal with a problem (4xx) means the request was judged and nothing changed (X-05), so it is a `failed`
// outcome. Anything else — a network error, a timeout, a 5xx, a 408 or 429 — leaves the outcome unknown, and the
// outbox sends the same envelope again (TS-22).

import { mutationResultSchema, problemSchema, type Mutation } from "@tonaris/domain";

import type { Fetch } from "./engine";
import type { Sent } from "./outbox";

/** Statuses that say nothing about whether the mutation ran. */
const unknownOutcome = new Set([408, 429]);

export function mutationSender(
  apiUrl: string,
  fetch: Fetch,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
) {
  return async (mutation: Mutation): Promise<Sent> => {
    try {
      const response = await fetch(`${apiUrl}/v1/mutations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutation),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        return { answered: mutationResultSchema.parse(await response.json()).outcome };
      }
      if (response.status < 500 && !unknownOutcome.has(response.status)) {
        const problem = problemSchema.safeParse(await response.json().catch(() => undefined));
        if (problem.success) {
          return { answered: { status: "failed", code: problem.data.code, problem: problem.data } };
        }
      }
      return { unanswered: new Error(`The API answered ${response.status}.`) };
    } catch (error) {
      return { unanswered: error };
    }
  };
}
