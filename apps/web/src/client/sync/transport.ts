// Sends one outbox entry (TS-20, TS-25) and tells an answer from no answer. One write goes to POST /v1/mutations,
// several to POST /v1/batches with the entry's ID as the batch's, each declaring the earlier writes it builds on
// (dependencies.ts), so the same entry always sends the same body. A 200 carries the outcomes. A refusal with a
// problem (4xx) means the request was judged and nothing changed (X-05), so every write in it failed. Anything
// else — a network error, a timeout, a 5xx, a 408 or 429, or a capture still running (`409 in_progress`) — leaves
// the outcomes unknown, and the outbox sends the same envelopes again (TS-22).

import {
  batchResultSchema,
  mutationResultSchema,
  problemSchema,
  type Outcome,
} from "@tonaris/domain";

import { dependenciesOf } from "./dependencies";
import type { Fetch } from "./engine";
import type { Sent } from "./outbox";
import type { OutboxEntry } from "./persistence";

/** Statuses that say nothing about whether the writes ran. */
const unknownOutcome = new Set([408, 429]);

/** How long a write waits for its answer before it counts as no answer (TS-22). */
export const requestTimeoutMs = 10_000;

/**
 * The failed outcome an answer gives the writes it carried, when the API judged them: a refusal with a problem (a
 * 4xx). Undefined when it says nothing of whether they ran: a 5xx, a 408 or a 429, no problem, or a capture still
 * running (409 `in_progress`), whose outcome comes with a later send. The outbox and the sharing forms read answers
 * through here, so they agree (DRIFT-084).
 */
export function refusalOf(status: number, body: unknown): Outcome | undefined {
  if (status < 400 || status >= 500 || unknownOutcome.has(status)) return undefined;
  const problem = problemSchema.safeParse(body);
  if (!problem.success || problem.data.code === "in_progress") return undefined;
  return { status: "failed", code: problem.data.code, problem: problem.data };
}

export function entrySender(
  apiUrl: string,
  fetch: Fetch,
  { timeoutMs = requestTimeoutMs }: { timeoutMs?: number } = {},
) {
  return async ({ id, items }: OutboxEntry): Promise<Sent> => {
    const mutations = items.map((item) => item.mutation);
    const [single] = mutations;
    const batch = mutations.length > 1 || !single;
    const dependencies = dependenciesOf(mutations);
    const envelopes = mutations.map((mutation, index) => {
      const dependsOn = dependencies[index];
      return dependsOn ? { ...mutation, dependsOn } : mutation;
    });
    try {
      const response = await fetch(`${apiUrl}/v1/${batch ? "batches" : "mutations"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch ? { batchId: id, items: envelopes } : single),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        const body: unknown = await response.json();
        if (!batch) return { answered: [mutationResultSchema.parse(body).outcome] };
        const outcomes = batchResultSchema.parse(body).items.map((item) => item.outcome);
        if (outcomes.length !== mutations.length)
          throw new Error("The batch answer doesn't match.");
        return { answered: outcomes };
      }
      const failed = refusalOf(response.status, await response.json().catch(() => undefined));
      if (failed) return { answered: mutations.map(() => failed) };
      return { unanswered: new Error(`The API answered ${response.status}.`) };
    } catch (error) {
      return { unanswered: error };
    }
  };
}
