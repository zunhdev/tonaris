// Sharing writes go straight to the API, online-only, with no outbox (TON-65): a fresh `mutationId`, sent once more
// with the same one if no answer came (TS-22), so a retry never does anything twice.

import { api } from "@/api";

import { uuidv7, type Mutation, type MutationResult } from "@tonaris/domain";

/** A mutation without its ID, which `sendNow` gives it. */
export type Unsent = Mutation extends infer M
  ? M extends Mutation
    ? Omit<M, "mutationId">
    : never
  : never;

export async function sendNow(mutation: Unsent): Promise<MutationResult["outcome"]> {
  const body = { mutationId: uuidv7(), ...mutation };
  const post = async () => {
    const { data } = await api.v1.mutations.post(body);
    if (!data) throw new Error("No answer from Tonaris.");
    return data.outcome;
  };
  try {
    return await post();
  } catch {
    return post();
  }
}

/** The outcome's reason, if it failed. */
export const failureOf = (outcome: MutationResult["outcome"]): string | undefined =>
  outcome.status === "failed"
    ? (outcome.problem.detail ?? "That didn't work. Try again.")
    : undefined;
