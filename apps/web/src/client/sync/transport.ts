// Sends one outbox entry (TS-20, TS-25) and tells an answer from no answer. One write goes to POST /v1/mutations,
// several to POST /v1/batches with the entry's ID as the batch's. A 200 carries the outcomes. A refusal with a
// problem (4xx) means the request was judged and nothing changed (X-05), so every write in it failed. Anything
// else — a network error, a timeout, a 5xx, a 408 or 429 — leaves the outcomes unknown, and the outbox sends the
// same envelopes again (TS-22).

import {
  batchResultSchema,
  mutationResultSchema,
  problemSchema,
  type Outcome,
} from "@tonaris/domain";

import type { Fetch } from "./engine";
import type { Sent } from "./outbox";
import type { OutboxEntry } from "./persistence";

/** Statuses that say nothing about whether the writes ran. */
const unknownOutcome = new Set([408, 429]);

export function entrySender(
  apiUrl: string,
  fetch: Fetch,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
) {
  return async ({ id, items }: OutboxEntry): Promise<Sent> => {
    const mutations = items.map((item) => item.mutation);
    const [single] = mutations;
    const batch = mutations.length > 1 || !single;
    try {
      const response = await fetch(`${apiUrl}/v1/${batch ? "batches" : "mutations"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch ? { batchId: id, items: mutations } : single),
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
      if (response.status < 500 && !unknownOutcome.has(response.status)) {
        const problem = problemSchema.safeParse(await response.json().catch(() => undefined));
        if (problem.success) {
          const failed: Outcome = {
            status: "failed",
            code: problem.data.code,
            problem: problem.data,
          };
          return { answered: mutations.map(() => failed) };
        }
      }
      return { unanswered: new Error(`The API answered ${response.status}.`) };
    } catch (error) {
      return { unanswered: error };
    }
  };
}
