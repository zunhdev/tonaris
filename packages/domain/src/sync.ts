// The sync protocol's messages (TS-20–TS-28), shared by the API and every client: the mutation envelope, the
// result the server answers with, the bootstrap snapshot and the change events on the stream. The prototype
// (TON-20) syncs albums; each entity type M2 adds joins these unions.

import { albumFieldsSchema, albumSchema } from "./albums";
import { containerSchema, membershipSchema } from "./containers";
import { outcomeSchema } from "./outcomes";
import { z } from "./zod";

/**
 * How long the server keeps idempotency records and the change log (TS-22, TS-23). A replay of an older mutation
 * is `expired`, and a stream cursor older than the log gets `reset`.
 */
export const syncRetentionMs = 30 * 86_400_000;

const mutationId = z.uuid({ version: "v7" }).meta({
  description: "Made once per intent by the client, and sent again on every retry (TS-22).",
});

/** `album.create`: the client chooses the ID (TS-10), so a retried create can't make a second album. */
export const albumCreateSchema = z.object({
  mutationId,
  name: z.literal("album.create"),
  args: albumSchema,
});

/**
 * `album.update`: `base` holds the prior value of every field in `args` (TS-21). A field whose saved value
 * differs from its base is a conflict, and nothing is applied.
 */
export const albumUpdateSchema = z.object({
  mutationId,
  name: z.literal("album.update"),
  args: albumFieldsSchema.partial().extend({ id: z.uuid() }),
  base: albumFieldsSchema.partial(),
});

/** One write, from the app or MCP (TS-20). */
export const mutationSchema = z
  .discriminatedUnion("name", [albumCreateSchema, albumUpdateSchema])
  .meta({ description: "A mutation envelope (TS-20)." });
export type Mutation = z.infer<typeof mutationSchema>;
export type MutationName = Mutation["name"];

/** What `POST /v1/mutations` and `GET /v1/mutations/{id}` answer: the stored outcome, the same on every replay. */
export const mutationResultSchema = z
  .object({ mutationId: z.uuid(), outcome: outcomeSchema })
  .meta({ description: "A mutation's outcome (TS-27)." });
export type MutationResult = z.infer<typeof mutationResultSchema>;

export const changeOps = ["insert", "update", "delete"] as const;
export type ChangeOp = (typeof changeOps)[number];

/**
 * One committed change, as the stream sends it (TS-23). `seq` counts the account's changes without gaps, so a
 * client that sees a gap knows it missed one. `data` is the whole record after the change; null when deleted.
 */
export const changeSchema = z
  .discriminatedUnion("entity", [
    z.object({
      seq: z.int().positive(),
      entity: z.literal("album"),
      id: z.uuid(),
      op: z.enum(changeOps),
      data: albumSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
  ])
  .meta({ description: "A committed change on the account's stream (TS-23)." });
export type Change = z.infer<typeof changeSchema>;

/** The owner's collection at `seq` (TS-24): a client then streams from that cursor. */
export const bootstrapSchema = z
  .object({
    seq: z.int().nonnegative(),
    albums: z.array(albumSchema),
    containers: z.array(containerSchema),
    memberships: z.array(membershipSchema),
  })
  .meta({ description: "A snapshot of the account's data at `seq` (TS-24)." });
export type Bootstrap = z.infer<typeof bootstrapSchema>;

/** Why the stream sent `reset`: the client must bootstrap again before streaming (TS-23). */
export const streamResetReasons = ["cursor_expired", "cursor_unknown"] as const;

/** The `reset` event's data. `cursor_expired`: the log no longer reaches back to the cursor. */
export const streamResetSchema = z.object({ reason: z.enum(streamResetReasons) }).meta({
  description: "The `reset` event: bootstrap again, then stream from the new `seq` (TS-23).",
});
export type StreamReset = z.infer<typeof streamResetSchema>;
