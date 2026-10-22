// Batches (TS-25, FR-13.4): up to 200 mutation envelopes, run in order, each on its own, so a success stays
// whatever happens to later items. An item may depend on earlier items of its batch, and runs only once they are
// confirmed. Each item is validated on its own; only the batch's frame, which outcomes are reported against, is
// checked as a whole.

import { maxBatchItems } from "./limits";
import { failure, type Outcome } from "./outcomes";
import { mutationResultSchema, mutationSchema, type Mutation, type MutationResult } from "./sync";
import { z } from "./zod";

const dependenciesSchema = z.object({
  dependsOn: z.array(z.uuid()).max(maxBatchItems).optional().meta({
    description: "The `mutationId`s of earlier items in the batch that must be confirmed first.",
  }),
});

/** One item of a batch: a mutation envelope, and the earlier items it depends on. */
export const batchItemSchema = mutationSchema
  .and(dependenciesSchema)
  .meta({ description: "A mutation envelope in a batch (TS-25)." });
export type BatchItem = z.infer<typeof batchItemSchema>;

/**
 * A batch as the server reads it: the frame is checked as a whole, and each item only for an ID to report its
 * outcome against. The rest of an item is validated on its own when it runs, so one bad item can't stop the others.
 */
export const batchSchema = z
  .object({
    batchId: z
      .uuid({ version: "v7" })
      .meta({ description: "Made by the client; the answer carries it." }),
    items: z
      .array(
        z.looseObject({ mutationId: z.uuid({ version: "v7" }) }).meta({
          description:
            "A `BatchItem` (`#/components/schemas/BatchItem`). Each item is validated on its own: one that isn't a valid `BatchItem` gets a `failed` outcome, and the others still run.",
        }),
      )
      .min(1)
      .max(maxBatchItems),
  })
  .superRefine(({ items }, context) => {
    const seen = new Set<string>();
    for (const [index, { mutationId }] of items.entries()) {
      if (seen.has(mutationId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "mutationId"],
          message: "Repeats an earlier item's ID",
        });
      }
      seen.add(mutationId);
    }
  })
  .meta({ description: "A batch of mutations (TS-25)." });
export type Batch = z.infer<typeof batchSchema>;

/** What `POST /v1/batches` answers: every item's outcome, in the order sent. */
export const batchResultSchema = z
  .object({ batchId: z.uuid(), items: z.array(mutationResultSchema) })
  .meta({ description: "Each item's outcome, in the order sent (TS-25)." });
export type BatchResult = z.infer<typeof batchResultSchema>;

/** The outcome of an item that isn't a valid `BatchItem`, with paths relative to the item. */
function invalidItem(issues: readonly z.core.$ZodIssue[]) {
  return failure(
    "validation_failed",
    "This item isn't a valid mutation.",
    issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}

/**
 * The outcome of one item, given the outcomes of the items before it. It runs only if it is valid and each of
 * its prerequisites was confirmed; otherwise it is skipped, naming the first that wasn't.
 */
async function itemOutcome(
  item: Batch["items"][number],
  earlier: ReadonlyMap<string, Outcome>,
  run: (mutation: Mutation) => Promise<Outcome>,
): Promise<Outcome> {
  const mutation = mutationSchema.safeParse(item);
  const dependencies = dependenciesSchema.safeParse(item);
  if (!mutation.success || !dependencies.success) {
    return invalidItem([...(mutation.error?.issues ?? []), ...(dependencies.error?.issues ?? [])]);
  }
  const dependsOn = dependencies.data.dependsOn ?? [];
  const unknown = dependsOn.flatMap((id, index) => (earlier.has(id) ? [] : [index]));
  if (unknown.length > 0) {
    return failure(
      "validation_failed",
      "An item can depend only on earlier items of its batch.",
      unknown.map((index) => ({
        path: `dependsOn.${index}`,
        message: "Not an earlier item of this batch",
      })),
    );
  }
  for (const id of dependsOn) {
    const prerequisite = earlier.get(id);
    if (prerequisite && prerequisite.status !== "confirmed") {
      return { status: "skipped", dependsOn: id, because: prerequisite.status };
    }
  }
  return run(mutation.data);
}

/**
 * Runs a batch's items in order with `run`, each on its own (TS-25). Items that are invalid or skipped never
 * reach `run`, so nothing records them: sent again, they are judged again.
 */
export async function runBatch(
  batch: Batch,
  run: (mutation: Mutation) => Promise<Outcome>,
): Promise<BatchResult> {
  const outcomes = new Map<string, Outcome>();
  const items: MutationResult[] = [];
  for (const item of batch.items) {
    // Items run one after another: each may depend on the ones before it.
    // oxlint-disable-next-line no-await-in-loop
    const outcome = await itemOutcome(item, outcomes, run);
    outcomes.set(item.mutationId, outcome);
    items.push({ mutationId: item.mutationId, outcome });
  }
  return { batchId: batch.batchId, items };
}
