// The sync protocol's messages (TS-20–TS-28), shared by the API and every client: the mutation envelope, the
// result the server answers with, the bootstrap snapshot and the change events on the stream. The prototype
// (TON-20) synced albums; folders and lists joined in TON-26 and list entries in TON-27, and each entity type M2
// adds joins these unions.

import { albumFieldsSchema, albumSchema } from "./albums";
import { containerSchema } from "./containers";
import { membershipSchema } from "./memberships";
import { outcomeSchema } from "./outcomes";
import { positionSchema } from "./positions";
import { viewDefaultsSchema, viewKeySchema, viewPrefsFieldsSchema, viewPrefsSchema } from "./views";
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

/**
 * `container.create`: a folder or list at the root (`parentId` null) or in a folder, with the client's ID
 * (TS-10), so a retried create can't make a second one (FR-01.1).
 */
export const containerCreateSchema = z.object({
  mutationId,
  name: z.literal("container.create"),
  args: containerSchema.extend({ id: z.uuid({ version: "v7" }) }),
});

/** `container.rename`: `base.name` is the name the client last saw (TS-21, FR-01.3). */
export const containerRenameSchema = z.object({
  mutationId,
  name: z.literal("container.rename"),
  args: z.object({ id: z.uuid(), name: z.string() }),
  base: z.object({ name: z.string() }),
});

/**
 * `container.move`: to another folder, or to the root with `parentId` null. `base.parentId` is the parent the
 * client last saw (TS-21). The container keeps its ID, so everything under it moves along (FR-01.4, FR-01.5).
 */
export const containerMoveSchema = z.object({
  mutationId,
  name: z.literal("container.move"),
  args: z.object({ id: z.uuid(), parentId: z.uuid().nullable() }),
  base: z.object({ parentId: z.uuid().nullable() }),
});

const entryArgs = z.object({ listId: z.uuid(), albumId: z.uuid() });

/**
 * `membership.add`: puts an album in a list (FR-01.6). An album already there keeps its entry, and the outcome's
 * `result` says so (`MembershipAddResult`, FR-01.7). There is no `base`: an entry has nothing to edit.
 */
export const membershipAddSchema = z.object({
  mutationId,
  name: z.literal("membership.add"),
  args: entryArgs,
});

/**
 * `membership.remove`: takes an album out of a list. The album stays in the collection, in Unsorted when it is
 * in no list (FR-01.8). Removing an entry that isn't there changes nothing.
 */
export const membershipRemoveSchema = z.object({
  mutationId,
  name: z.literal("membership.remove"),
  args: entryArgs,
});

/**
 * `view.set`: remembers or clears a person's choices for one view (FR-11.7). A field left out stays; null clears it
 * back to the account default. The sort's mode and direction change together. `base` holds the prior value of every
 * field in `args`, null for one not set (TS-21, FR-09.4). Clearing every field forgets the view.
 */
export const viewSetSchema = z.object({
  mutationId,
  name: z.literal("view.set"),
  args: viewPrefsFieldsSchema.partial().extend({ viewKey: viewKeySchema }),
  base: viewPrefsFieldsSchema.partial(),
});

/** `defaults.set`: changes some of a person's account defaults; `base` holds their prior values (TS-21). */
export const defaultsSetSchema = z.object({
  mutationId,
  name: z.literal("defaults.set"),
  args: viewDefaultsSchema.partial(),
  base: viewDefaultsSchema.partial(),
});

/**
 * `order.set`: places items in one of the person's views, as one move (TS-16, FR-05.2). `keys` maps each item's ID to
 * its new fractional-index key, or null to clear its place; `base` maps each to its key before, null for none
 * (TS-21). Every item must be in the view.
 */
export const orderSetSchema = z.object({
  mutationId,
  name: z.literal("order.set"),
  args: z.object({
    viewKey: viewKeySchema,
    keys: z.record(z.uuid(), z.string().nullable()),
  }),
  base: z.record(z.uuid(), z.string().nullable()),
});

/** `membership.add`'s `result` in a `confirmed` outcome. */
export const membershipAddResultSchema = z
  .object({
    alreadyInList: z.boolean().meta({
      description: "The album was already in the list: its entry was kept unchanged (FR-01.7).",
    }),
  })
  .meta({ description: "What `membership.add` reports (FR-01.7)." });
export type MembershipAddResult = z.infer<typeof membershipAddResultSchema>;

/** One write, from the app or MCP (TS-20). */
export const mutationSchema = z
  .discriminatedUnion("name", [
    albumCreateSchema,
    albumUpdateSchema,
    containerCreateSchema,
    containerRenameSchema,
    containerMoveSchema,
    membershipAddSchema,
    membershipRemoveSchema,
    viewSetSchema,
    defaultsSetSchema,
    orderSetSchema,
  ])
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

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

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
    z.object({
      seq: z.int().positive(),
      entity: z.literal("container"),
      id: z.uuid(),
      op: z.enum(changeOps),
      data: containerSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("membership"),
      id: z
        .string()
        .regex(new RegExp(`^${uuidPattern}:${uuidPattern}$`, "i"))
        .meta({
          description: "The list's ID and the album's, joined by a colon.",
        }),
      op: z.enum(changeOps),
      data: membershipSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("view"),
      id: viewKeySchema,
      op: z.enum(changeOps),
      data: viewPrefsSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("position"),
      id: z.string().meta({ description: "The view key and the item's ID, joined by a colon." }),
      op: z.enum(changeOps),
      data: positionSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("defaults"),
      id: z.uuid().meta({ description: "The account's ID." }),
      op: z.enum(changeOps),
      data: viewDefaultsSchema,
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
    views: z.array(viewPrefsSchema).meta({ description: "The person's remembered view choices." }),
    positions: z
      .array(positionSchema)
      .meta({ description: "The person's manual order: one key per arranged item (TS-16)." }),
    defaults: viewDefaultsSchema.meta({
      description: "The person's account defaults, DS-44's until they save their own.",
    }),
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
