// How the write tools write (TS-20, TS-22, TS-25, TS-63). A tool's change is a batch of the app's own mutation
// envelopes, so every rule is the app's (X-02): it runs through the API's mutation runner as `POST /v1/batches` runs
// it, item by item, with dependencies, and each item's changes go to the streams as it commits (X-08). The tool's
// `idempotencyKey` names the batch: the IDs of its mutations and of any record it creates are derived from the batch's
// ID, so sending the same key again replays what ran and judges the rest again (FR-13.5).

import { createHash } from "node:crypto";

import {
  claimOperation,
  executeBatch,
  executeMutation,
  lockAccount,
  useApproval,
  type Database,
  type ExecutedMutation,
  type Transaction,
} from "@tonaris/db";
import {
  canonicalJson,
  failure,
  scopeHash,
  uuidv7,
  type ApprovalScope,
  type Batch,
  type Mutation,
  type McpPrincipal,
  type MutationResult,
} from "@tonaris/domain";

import { MutationInProgressError, type Mutations } from "../sync/runner";

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

/**
 * A gated write (TS-64): the approved operation's envelopes, run only while the approval is usable. `scope` computes
 * the operation's scope again inside the transaction that uses the approval, after the owner's lock, so nothing can
 * grow it before the change commits. `outsideLock` runs the envelopes after that transaction instead, through the
 * mutation runner, for a capture, which asks its providers before it takes the lock.
 */
export type ApprovedWrite = {
  tool: string;
  args: Record<string, unknown>;
  idempotencyKey: string | undefined;
  approvalId: string;
  scope: (tx: Transaction) => Promise<ApprovalScope | undefined>;
  plan: (ids: PlanIds) => PlannedItem[];
  outsideLock?: boolean;
};

export type ApprovedWriteResult =
  | WriteResult
  /** The scope grew or changed since the owner approved: nothing ran, and it needs a new approval. */
  | { status: "scope_changed"; idempotencyKey: string; scope: ApprovalScope | undefined }
  /** The approval isn't approved, unexpired and unused for this connection: nothing ran. */
  | { status: "not_usable"; idempotencyKey: string };

export type McpWriter = {
  write: Writer;
  writeApproved: (principal: McpPrincipal, request: ApprovedWrite) => Promise<ApprovedWriteResult>;
};

export function mcpWriter({
  db,
  mutations: { run, announce },
}: {
  db: Database;
  /** The API's mutation runner, and the announcer that hands changes to the streams, as the sync routes use them. */
  mutations: Mutations;
}): McpWriter {
  /** Claims the key for the request's batch, and plans its envelopes with the batch's IDs. */
  async function claim(
    principal: McpPrincipal,
    { tool, args, idempotencyKey, plan }: Parameters<Writer>[1],
  ) {
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
    const claimed = await claimOperation(db, {
      grantId: principal.grantId,
      key,
      requestHash: requestHash(tool, args),
      batchId,
      items: items.length,
    });
    if (claimed.status === "reused") return { key, reused: true as const };
    if (claimed.batchId !== batchId) {
      batchId = claimed.batchId;
      items = build(batchId);
    }
    return { key, reused: false as const, batch: { batchId, items } };
  }

  /** Runs a batch through the mutation runner, as `POST /v1/batches` does, announcing each item as it commits. */
  const runBatch = (principal: McpPrincipal, batch: Batch) =>
    executeBatch(db, principal, batch, {
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
    });

  return {
    async write(principal, request) {
      const claimed = await claim(principal, request);
      if (claimed.reused) return { status: "key_reused", idempotencyKey: claimed.key };
      const result = await runBatch(principal, claimed.batch);
      return { status: "ran", idempotencyKey: claimed.key, items: result.items };
    },

    async writeApproved(principal, { approvalId, scope, outsideLock = false, ...request }) {
      const claimed = await claim(principal, request);
      if (claimed.reused) return { status: "key_reused", idempotencyKey: claimed.key };
      const { batch } = claimed;
      const executed: ExecutedMutation[] = [];
      type Answer =
        | { status: "scope_changed"; scope: ApprovalScope | undefined }
        | { status: "not_usable" }
        | { status: "approved" }
        | { status: "ran"; items: MutationResult[] };
      const answer = await db.transaction(async (tx): Promise<Answer> => {
        await lockAccount(tx, principal.userId);
        const now = await scope(tx);
        const use = await useApproval(tx, {
          id: approvalId,
          grantId: principal.grantId,
          scopeHash: now ? await scopeHash(now) : "",
          batchId: batch.batchId,
        });
        if (use === "scope_changed") return { status: use, scope: now };
        if (use === "not_usable") return { status: use };
        if (outsideLock) return { status: "approved" };
        // The envelopes run here, each as a savepoint, so they commit with the approval's use or not at all.
        const result = await executeBatch(tx, principal, batch, {
          execute: async (mutation) => {
            const done = await executeMutation(tx, principal, mutation);
            executed.push(done);
            return done;
          },
        });
        return { status: "ran", items: result.items };
      });
      // Only committed changes reach the streams.
      for (const done of executed) announce(principal.userId, done);
      const idempotencyKey = claimed.key;
      if (answer.status === "scope_changed") {
        return { status: answer.status, idempotencyKey, scope: answer.scope };
      }
      if (answer.status === "not_usable") return { status: answer.status, idempotencyKey };
      if (answer.status === "ran") return { status: "ran", idempotencyKey, items: answer.items };
      const result = await runBatch(principal, batch);
      return { status: "ran", idempotencyKey, items: result.items };
    },
  };
}
