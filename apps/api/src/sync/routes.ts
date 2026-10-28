// The sync protocol's endpoints (TS-20–TS-24, TS-28), one contract for the web app and native clients:
// - POST /v1/mutations runs a mutation envelope and answers with its outcome, the same on every retry;
// - POST /v1/batches runs up to 200 of them in order, each on its own, and answers with every item's outcome;
// - GET /v1/mutations/{id} looks an outcome up, to reconcile one whose answer was lost (TS-22);
// - a capture, which asks metadata sources before the write lock, answers `409 in_progress` while it runs;
// - GET /v1/sync/bootstrap is the account's data at a `seq`;
// - GET /v1/sync/stream streams the changes after a cursor, as server-sent events.
// Each accepts the session cookie today; bearer tokens for native apps and MCP arrive with TS-30 and TS-61.

import { Elysia } from "elysia";
import { z } from "zod";

import {
  bootstrapSnapshot,
  executeBatch,
  findMutationResult,
  mutationRunning,
  type Database,
} from "@tonaris/db";
import {
  batchResultSchema,
  batchSchema,
  bootstrapSchema,
  mutationResultSchema,
  mutationSchema,
  problemSchema,
} from "@tonaris/domain";

import { presentBootstrap, presentChange, type ArtworkSigner } from "../artwork";
import type { SessionGuard } from "../auth/plugin";
import { MutationInProgressError, mutationRunner, type CaptureDeps } from "../capture";
import { ProblemError } from "../problem";
import { eventStream, type StreamSource } from "../sse";
import type { SyncEvent, SyncHub } from "./hub";

const cursor = z
  .string()
  .regex(/^\d+$/)
  .meta({ description: "The `seq` of the last change the client has." });

const inProgress = () =>
  new ProblemError(
    409,
    "in_progress",
    "This change is still being saved. Check its outcome again in a moment.",
  );

/**
 * A request carrying a capture may wait on MusicBrainz for longer than Bun's 10 s idle timeout, so it switches that
 * off for itself, as the streams do (TS-23).
 */
function keepOpen(
  request: Request,
  server: { timeout(request: Request, seconds: number): void } | null,
  mutations: readonly unknown[],
): void {
  const captures = mutations.some(
    (mutation) =>
      typeof mutation === "object" &&
      mutation !== null &&
      "name" in mutation &&
      mutation.name === "album.capture",
  );
  if (captures) server?.timeout(request, 0);
}

/** The stream's events with albums' artwork signed, as clients show it (TS-103). */
function presented(
  source: StreamSource<SyncEvent>,
  artwork: ArtworkSigner,
): StreamSource<SyncEvent> {
  return {
    end: () => source.end(),
    async next() {
      const result = await source.next();
      if (result.done || result.value.event !== "change") return result;
      return {
        ...result,
        value: { ...result.value, data: presentChange(artwork, result.value.data) },
      };
    },
  };
}

export function syncRoutes(
  session: SessionGuard,
  {
    db,
    hub,
    capture,
    artwork,
  }: { db: Database; hub: SyncHub; capture?: CaptureDeps | undefined; artwork: ArtworkSigner },
) {
  const run = mutationRunner(db, capture);
  return new Elysia()
    .use(session)
    .post(
      "/mutations",
      {
        signedIn: true,
        body: mutationSchema,
        response: {
          200: mutationResultSchema,
          401: problemSchema,
          409: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Run a mutation",
          description:
            "Runs one mutation envelope (TS-20) and answers with its outcome (TS-27). Sending the same `mutationId` again returns the stored outcome without running it twice (TS-22). An `album.capture` still running answers `409 in_progress`.",
          tags: ["sync"],
          operationId: "postMutation",
        },
      },
      async ({ body, principal, account, request, server }) => {
        keepOpen(request, server, [body]);
        try {
          const { result, changes } = await run(principal, body);
          hub.publish(account.id, changes);
          return result;
        } catch (error) {
          if (error instanceof MutationInProgressError) throw inProgress();
          throw error;
        }
      },
    )
    .post(
      "/batches",
      {
        signedIn: true,
        body: batchSchema,
        response: {
          200: batchResultSchema,
          401: problemSchema,
          409: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Run a batch of mutations",
          description:
            "Runs up to 200 `BatchItem`s in order, each on its own, so a success stays whatever happens to later items (TS-25). An item runs only once every item it `dependsOn` is confirmed; otherwise it is `skipped`. Each item is validated and made idempotent by its `mutationId` as a single mutation is, so sending the batch again applies nothing twice. An `album.capture` item still running in another request answers the batch `409 in_progress`: the items before it stay saved, and sending the batch again replays them.",
          tags: ["sync"],
          operationId: "postBatch",
        },
      },
      async ({ body, principal, account, request, server }) => {
        keepOpen(request, server, body.items);
        try {
          return await executeBatch(db, principal, body, {
            onExecuted: (changes) => hub.publish(account.id, changes),
            execute: (mutation) => run(principal, mutation),
          });
        } catch (error) {
          if (error instanceof MutationInProgressError) throw inProgress();
          throw error;
        }
      },
    )
    .get(
      "/mutations/:id",
      {
        signedIn: true,
        params: z.object({ id: z.uuid() }),
        response: {
          200: mutationResultSchema,
          401: problemSchema,
          404: problemSchema,
          409: problemSchema,
          422: problemSchema,
        },
        detail: {
          summary: "Get a mutation's outcome",
          description:
            "The stored outcome of a mutation this account sent, kept for 30 days (TS-22). A client whose request went unanswered reconciles with it. A capture still running answers `409 in_progress`.",
          tags: ["sync"],
          operationId: "getMutation",
        },
      },
      async ({ params, account }) => {
        const result = await findMutationResult(db, account.id, params.id);
        if (result) return result;
        if (await mutationRunning(db, account.id, params.id)) throw inProgress();
        throw new ProblemError(404, "not_found", "No mutation with this ID was received.");
      },
    )
    .get(
      "/sync/bootstrap",
      {
        signedIn: true,
        response: { 200: bootstrapSchema, 401: problemSchema },
        detail: {
          summary: "Get the account's data",
          description:
            "The account's data and the `seq` it is current at (TS-24). Stream from that `seq` next.",
          tags: ["sync"],
          operationId: "getBootstrap",
        },
      },
      async ({ account }) => presentBootstrap(artwork, await bootstrapSnapshot(db, account.id)),
    )
    .get(
      "/sync/stream",
      {
        signedIn: true,
        headers: z.object({ "last-event-id": cursor.optional() }),
        query: z.object({ after: cursor.optional() }),
        detail: {
          summary: "Stream the account's changes",
          description:
            "Server-sent events (TS-23): `change` events with `id` set to their `seq`, after `Last-Event-ID` (or `after` on a first connection), then live. `reset` means the cursor can't be continued: bootstrap again. Comment lines keep the connection alive.",
          tags: ["sync"],
          operationId: "streamChanges",
          responses: {
            200: {
              description: "`change` and `reset` events",
              // Component references: Zod's JSON Schema type doesn't fit openapi-types' schema objects.
              content: {
                "text/event-stream": {
                  schema: {
                    oneOf: [
                      { $ref: "#/components/schemas/Change" },
                      { $ref: "#/components/schemas/StreamReset" },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      async function* ({ request, server, headers, query, account, sessionId }) {
        const after = Number(headers["last-event-id"] ?? query.after ?? 0);
        yield* eventStream(presented(hub.subscribe(account.id, after, sessionId), artwork), {
          request,
          server,
          signal: hub.signal,
        });
      },
    );
}
