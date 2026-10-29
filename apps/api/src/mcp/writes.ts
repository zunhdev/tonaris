// How the write tools write (TS-20, TS-22, TS-25, TS-63). A tool's change is a batch of the app's own mutation
// envelopes, so every rule is the app's (X-02): it runs through the API's mutation runner as `POST /v1/batches` runs
// it, item by item, with dependencies, and each item's changes go to the streams as it commits (X-08). The tool's
// `idempotencyKey` names the batch: the IDs of its mutations and of any record it creates are derived from the batch's
// ID, so sending the same key again replays what ran and judges the rest again (FR-13.5).

import { createHash } from "node:crypto";

import { claimOperation, executeBatch, type Database, type ExecutedMutation } from "@tonaris/db";
import {
  canonicalJson,
  failure,
  uuidv7,
  type Mutation,
  type McpPrincipal,
  type MutationResult,
} from "@tonaris/domain";

import { MutationInProgressError, type MutationRunner } from "../capture";

/**
 * A UUIDv7 derived from the v7 `base` and `salt`: its timestamp stays the base's, so the mutation keeps the age TS-22's
 * retention judges, and the rest comes from SHA-256, so the same base and salt always give the same ID.
 */
export function derivedId(base: string, salt: string): string {
  const bytes = Buffer.from(base.replaceAll("-", ""), "hex");
  const hash = createHash("sha256").update(`${base}:${salt}`).digest();
  bytes[6] = 0x70 | ((hash[0] ?? 0) & 0x0f);
  bytes[7] = hash[1] ?? 0;
  bytes[8] = 0x80 | ((hash[2] ?? 0) & 0x3f);
  hash.copy(bytes, 9, 3, 10);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The IDs a tool's plan uses, all derived from its batch: the same on every retry of its key. */
export type PlanIds = {
  /** The ID of a record the change creates, such as a new list: `name` tells them apart. */
  record: (name: string) => string;
};

/**
 * One planned envelope without its ID, and the earlier items, by index, it depends on. `runBatch` validates it as any
 * batch item, so one the agent's input makes invalid fails alone with `validation_failed`.
 */
export type PlannedItem = {
  name: Mutation["name"];
  args: Record<string, unknown>;
  base?: Record<string, unknown>;
  after?: number[];
};

/** What a write did: the key it ran under, and each planned item's mutation ID and outcome, in order. */
export type WriteResult =
  | { status: "ran"; idempotencyKey: string; items: MutationResult[] }
  /** The connection used the key for a different change; nothing ran. */
  | { status: "key_reused"; idempotencyKey: string };

export type Writer = (
  principal: McpPrincipal,
  request: {
    /** The tool, which with `args` is the request a key stands for. */
    tool: string;
    args: Record<string, unknown>;
    idempotencyKey: string | undefined;
    plan: (ids: PlanIds) => PlannedItem[];
  },
) => Promise<WriteResult>;

/** The request a key stands for: the tool and its arguments, without the key. */
function requestHash(tool: string, args: Record<string, unknown>): string {
  const { idempotencyKey: _, ...rest } = args;
  return createHash("sha256")
    .update(`${tool}\n${canonicalJson(rest)}`)
    .digest("hex");
}

const itemSalt = (index: number) => `mutation:${index}`;

/** The mutation IDs of a batch of `items`, in order. */
export const batchMutationIds = (batchId: string, items: number) =>
  Array.from({ length: items }, (_, index) => derivedId(batchId, itemSalt(index)));

/** What a capture still running elsewhere answers, until it is done (TS-22). */
const stillRunning = failure(
  "in_progress",
  "This change is still being saved. Check it with get_operation in a moment.",
);

export function mcpWriter({
  db,
  run,
  announce,
}: {
  db: Database;
  run: MutationRunner;
  /** Hands a write's changes to the account's streams, as the sync routes do. */
  announce: (accountId: string, executed: ExecutedMutation) => void;
}): Writer {
  return async (principal, { tool, args, idempotencyKey, plan }) => {
    const key = idempotencyKey ?? uuidv7();
    const build = (batchId: string) => {
      const ids: PlanIds = { record: (name) => derivedId(batchId, `record:${name}`) };
      const planned = plan(ids);
      const mutationIds = batchMutationIds(batchId, planned.length);
      return planned.map(({ after = [], ...item }, index) =>
        Object.assign(
          item,
          { mutationId: mutationIds[index] ?? "" },
          after.length > 0 ? { dependsOn: after.map((at) => mutationIds[at] ?? "") } : {},
        ),
      );
    };
    let batchId = uuidv7();
    let items = build(batchId);
    const claim = await claimOperation(db, {
      grantId: principal.grantId,
      key,
      requestHash: requestHash(tool, args),
      batchId,
      items: items.length,
    });
    if (claim.status === "reused") return { status: "key_reused", idempotencyKey: key };
    if (claim.batchId !== batchId) {
      batchId = claim.batchId;
      items = build(batchId);
    }
    const result = await executeBatch(
      db,
      principal,
      { batchId, items },
      {
        execute: async (mutation) => {
          try {
            const executed = await run(principal, mutation);
            announce(principal.userId, executed);
            return executed;
          } catch (error) {
            // A capture another request is running: this item waits, and its dependents with it.
            if (!(error instanceof MutationInProgressError)) throw error;
            const { mutationId } = mutation;
            return { result: { mutationId, outcome: stillRunning }, changes: [], replayed: false };
          }
        },
      },
    );
    return { status: "ran", idempotencyKey: key, items: result.items };
  };
}
