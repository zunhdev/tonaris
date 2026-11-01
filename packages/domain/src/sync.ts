// The sync protocol's messages (TS-20–TS-28), shared by the API and every client: the mutation envelope, the
// result the server answers with, the bootstrap snapshot and the change events on the stream. The prototype
// (TON-20) synced albums; folders and lists joined in TON-26 and list entries in TON-27, and each entity type M2
// adds joins these unions.

import {
  albumCreateArgsSchema,
  albumFieldsSchema,
  artworkUrlSchema,
  syncedAlbumSchema,
} from "./albums";
import { captureArgsSchema } from "./capture";
import { containerFieldsSchema, containerSchema } from "./containers";
import { fieldDeleteArgsSchema } from "./field-deletion";
import {
  fieldAddOptionArgsSchema,
  fieldChangeTypeArgsSchema,
  fieldRemoveOptionArgsSchema,
  fieldRenameOptionArgsSchema,
} from "./field-options";
import { fieldValueDataSchema, fieldValueSchema } from "./field-values";
import { customFieldSchema, fieldCreateArgsSchema, fieldTypes } from "./fields";
import { uuidv7Time } from "./ids";
import { streamingServices } from "./links";
import { membershipSchema } from "./memberships";
import { failure, outcomeSchema, type Failure } from "./outcomes";
import { positionSchema } from "./positions";
import { linkRemoveArgsSchema, linkSetArgsSchema, serviceLinkSchema } from "./service-links";
import {
  grantArgsSchema,
  leaveArgsSchema,
  referenceSchema,
  removeReferenceArgsSchema,
  saveLinkArgsSchema,
  setDisplayNameArgsSchema,
  shareInviteArgsSchema,
  shareSetLinkArgsSchema,
} from "./sharing";
import {
  albumDeleteArgsSchema,
  containerDeleteArgsSchema,
  trashPurgeArgsSchema,
  trashRecoverArgsSchema,
  trashUnitSchema,
} from "./trash";
import {
  accountDefaultsSchema,
  linkTargets,
  viewDefaultsSchema,
  viewKeySchema,
  viewPrefsFieldsSchema,
  viewPrefsSchema,
} from "./views";
import { z } from "./zod";

/**
 * How long the server keeps idempotency records and the change log (TS-22, TS-23). A replay of an older mutation
 * is `expired`, and a stream cursor older than the log gets `reset`.
 */
export const syncRetentionMs = 30 * 86_400_000;

/** A guest's mutation, refused before it runs: a link's guests only read (FR-07.11, TS-20). */
export const guestMutationRefusal: Failure = failure(
  "permission_denied",
  "Guests can't change anything.",
);

/** A mutation ID another mutation holds: another account's, or one not claimed by this request (TS-22). */
export const mutationIdInUse: Failure = failure(
  "validation_failed",
  "This mutation ID is already in use.",
  [{ path: "mutationId", message: "Already in use" }],
);

/**
 * `expired` for a mutation too old to be retried (TS-22): made before the retention window, so its record may be
 * gone and it can't be told from a new one. Its time is the one in its UUIDv7, from the client's clock; an ID
 * without one counts as made `now`.
 */
export function mutationTooOld(mutationId: string, now: Date): Failure | undefined {
  const madeAt = uuidv7Time(mutationId) ?? now.getTime();
  if (madeAt >= now.getTime() - syncRetentionMs) return undefined;
  return failure(
    "expired",
    "This change is too old to be retried. Check the saved state and make it again.",
  );
}

const mutationId = z.uuid({ version: "v7" }).meta({
  description: "Made once per intent by the client, and sent again on every retry (TS-22).",
});

/** `album.create`: the client chooses the ID (TS-10), so a retried create can't make a second album. */
export const albumCreateSchema = z.object({
  mutationId,
  name: z.literal("album.create"),
  args: albumCreateArgsSchema,
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
 * `album.setArtwork`: sets or clears an album's artwork URL (FR-03.4), if it is still `base.artworkUrl` (TS-21). An
 * album's artwork has its own mutation, so `album.create` and `album.update` keep their shapes (TS-09).
 */
export const albumSetArtworkSchema = z.object({
  mutationId,
  name: z.literal("album.setArtwork"),
  args: z.object({ id: z.uuid(), artworkUrl: artworkUrlSchema }),
  base: z.object({ artworkUrl: z.string().nullable() }),
});

/**
 * `album.capture`: saves the album a pasted link names, reusing the owner's album when it is the same one, in Trash or
 * not (FR-02.9, FR-14.4). The server asks metadata sources first, so it may answer `409 in_progress` to a copy sent
 * while it runs (TS-22). It answers `needs_input` for a choice or missing details; resubmit with them (TS-26).
 */
export const albumCaptureSchema = z.object({
  mutationId,
  name: z.literal("album.capture"),
  args: captureArgsSchema,
});

/** `field.create`: defines a custom field, with a choice field's options (FR-03.6), with the client's IDs (TS-10). */
export const fieldCreateSchema = z.object({
  mutationId,
  name: z.literal("field.create"),
  args: fieldCreateArgsSchema,
});

/** `field.rename`: renames a field everywhere (FR-03.11); `base.name` is the name the client last saw (TS-21). */
export const fieldRenameSchema = z.object({
  mutationId,
  name: z.literal("field.rename"),
  args: z.object({ id: z.uuid(), name: z.string() }),
  base: z.object({ name: z.string() }),
});

/**
 * `field.changeType`: changes a field's type while no album uses it, in Trash or not, even empty (FR-03.12).
 * Options stay between single and multiple choice, and are discarded for any other type; the `confirmed` outcome's
 * `result` names those discarded (FR-03.13). A used field is `field_in_use`.
 */
export const fieldChangeTypeSchema = z.object({
  mutationId,
  name: z.literal("field.changeType"),
  args: fieldChangeTypeArgsSchema,
  base: z.object({ type: z.enum(fieldTypes) }),
});

/** `field.addOption`: adds an option at the end of a choice field, with the client's ID (FR-03.15, TS-10). */
export const fieldAddOptionSchema = z.object({
  mutationId,
  name: z.literal("field.addOption"),
  args: fieldAddOptionArgsSchema,
});

/** `field.renameOption`: relabels an option, keeping its selections (FR-03.16); `base.label` as last seen (TS-21). */
export const fieldRenameOptionSchema = z.object({
  mutationId,
  name: z.literal("field.renameOption"),
  args: fieldRenameOptionArgsSchema,
  base: z.object({ label: z.string() }),
});

/**
 * `field.removeOption`: removes an option, clearing it from every album, Trash included (FR-03.17). A chosen option
 * needs `scopeHash` from its removal read (TS-14); without it, or with a stale one, it is `field_in_use`.
 */
export const fieldRemoveOptionSchema = z.object({
  mutationId,
  name: z.literal("field.removeOption"),
  args: fieldRemoveOptionArgsSchema,
});

/**
 * `field.delete`: deletes a field permanently, with its options and every album's usage and value, Trash included
 * (FR-03.18). Always confirmed: `scopeHash` comes from its deletion read (TS-14); a stale one is `field_in_use`.
 */
export const fieldDeleteSchema = z.object({
  mutationId,
  name: z.literal("field.delete"),
  args: fieldDeleteArgsSchema,
});

/**
 * `container.delete`: moves a folder or list, with its active descendants, to Trash as one unit, whose ID the client
 * chose (FR-01.11, FR-01.13, TS-10). Albums left in no active list enter Unsorted.
 */
export const containerDeleteSchema = z.object({
  mutationId,
  name: z.literal("container.delete"),
  args: containerDeleteArgsSchema,
});

/**
 * `trash.recover`: returns a unit from Trash to its root's parent, or to `parentId`, named as before or `name`
 * (FR-01.14 to FR-01.16). It answers `needs_input` for a destination when the parent isn't active, and for a name when
 * it is taken there; resubmit with the choice (TS-26).
 */
/**
 * `album.delete`: moves an album to Trash as its own unit, whose ID the client chose (FR-14.1, TS-10). It leaves every
 * list and Unsorted; its information, links, field values and entries are kept for its restore.
 */
export const albumDeleteSchema = z.object({
  mutationId,
  name: z.literal("album.delete"),
  args: albumDeleteArgsSchema,
});

/**
 * `trash.purge`: removes units from Trash for good, early (FR-01.18): those the owner confirmed, or all for Empty Trash.
 * App-only (X-03). Its `confirmed` result is `{purged, gone}`, the units removed and those no longer in Trash.
 */
export const trashPurgeSchema = z.object({
  mutationId,
  name: z.literal("trash.purge"),
  args: trashPurgeArgsSchema,
});

export const trashRecoverSchema = z.object({
  mutationId,
  name: z.literal("trash.recover"),
  args: trashRecoverArgsSchema,
});

const fieldValueArgs = z.object({ albumId: z.uuid(), fieldId: z.uuid() });

/** `fieldValue.apply`: applies a custom field to an album, empty (FR-03.7). Already applied, it changes nothing. */
export const fieldValueApplySchema = z.object({
  mutationId,
  name: z.literal("fieldValue.apply"),
  args: fieldValueArgs,
});

/**
 * `fieldValue.set`: sets or clears the value of a field the album applies (FR-03.7, FR-03.10). `base.value` is the
 * value the client last saw (TS-21). Null empties it; the field stays applied.
 */
export const fieldValueSetSchema = z.object({
  mutationId,
  name: z.literal("fieldValue.set"),
  args: fieldValueArgs.extend({ value: fieldValueDataSchema }),
  base: z.object({ value: fieldValueDataSchema }),
});

/** `fieldValue.remove`: takes a field off an album with its value (FR-03.8). Already unused, it changes nothing. */
export const fieldValueRemoveSchema = z.object({
  mutationId,
  name: z.literal("fieldValue.remove"),
  args: fieldValueArgs,
});

/**
 * `container.create`: a folder or list at the root (`parentId` null) or in a folder, with the client's ID
 * (TS-10), so a retried create can't make a second one (FR-01.1).
 */
export const containerCreateSchema = z.object({
  mutationId,
  name: z.literal("container.create"),
  args: containerFieldsSchema.extend({ id: z.uuid({ version: "v7" }) }),
});

/**
 * `container.describe`: sets a folder's or list's plain-text description, or clears it with null or empty text
 * (FR-03.5); `base.description` is the one the client last saw (TS-21). At most 2,000 characters.
 */
export const containerDescribeSchema = z.object({
  mutationId,
  name: z.literal("container.describe"),
  args: z.object({ id: z.uuid(), description: z.string().nullable() }),
  base: z.object({ description: z.string().nullable() }),
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
 * `link.set`: adds an album's link for a service, or replaces it (FR-06.3). `url` is the link as pasted; the server
 * reads it (TS-40) and stores its canonical URL. `base.url` is the link the client last saw, null for none (TS-21).
 */
export const linkSetSchema = z.object({
  mutationId,
  name: z.literal("link.set"),
  args: linkSetArgsSchema,
  base: z.object({ url: z.string().nullable() }),
});

/** `link.remove`: removes an album's link for a service, if it is still `base.url` (FR-06.3, TS-21). */
export const linkRemoveSchema = z.object({
  mutationId,
  name: z.literal("link.remove"),
  args: linkRemoveArgsSchema,
  base: z.object({ url: z.string() }),
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
 * `defaults.setLinkTarget`: sets where the person's service links open, `web` or `app` (FR-06.6, TON-104); `base`
 * holds the prior setting (TS-21).
 */
export const defaultsSetLinkTargetSchema = z.object({
  mutationId,
  name: z.literal("defaults.setLinkTarget"),
  args: z.object({ linkTarget: z.enum(linkTargets) }),
  base: z.object({ linkTarget: z.enum(linkTargets) }),
});

/**
 * `defaults.setHiddenServices`: sets the streaming services the person turned off, whose empty link fields stay out
 * of sight (TON-138); `base` holds the prior list (TS-21).
 */
export const defaultsSetHiddenServicesSchema = z.object({
  mutationId,
  name: z.literal("defaults.setHiddenServices"),
  args: z.object({ hiddenServices: z.array(z.enum(streamingServices)) }),
  base: z.object({ hiddenServices: z.array(z.enum(streamingServices)) }),
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
/** `share.invite`: invites an existing account to view a folder or list (FR-07.4). App-only (X-03). */
export const shareInviteSchema = z.object({
  mutationId,
  name: z.literal("share.invite"),
  args: shareInviteArgsSchema,
});

/** `share.setLink`: turns a folder's or list's link on or off (FR-07.1, FR-07.16). App-only (X-03). */
export const shareSetLinkSchema = z.object({
  mutationId,
  name: z.literal("share.setLink"),
  args: shareSetLinkArgsSchema,
});

/** `share.resendInvitation`: emails a pending invitation again (FR-07.5). App-only (X-03). */
export const shareResendInvitationSchema = z.object({
  mutationId,
  name: z.literal("share.resendInvitation"),
  args: grantArgsSchema,
});

/** `share.accept`: the recipient accepts an invitation (FR-07.6). App-only (X-03). */
export const shareAcceptSchema = z.object({
  mutationId,
  name: z.literal("share.accept"),
  args: grantArgsSchema,
});

/** `share.decline`: the recipient declines an invitation (FR-07.6). App-only (X-03). */
export const shareDeclineSchema = z.object({
  mutationId,
  name: z.literal("share.decline"),
  args: grantArgsSchema,
});

/** `share.leave`: the viewer leaves a share they accepted by invitation (FR-07.7). App-only (X-03). */
export const shareLeaveSchema = z.object({
  mutationId,
  name: z.literal("share.leave"),
  args: leaveArgsSchema,
});

/** `share.revoke`: the owner revokes an invitation (FR-07.15). App-only (X-03). */
export const shareRevokeSchema = z.object({
  mutationId,
  name: z.literal("share.revoke"),
  args: grantArgsSchema,
});

/** `share.saveLink`: keeps a link's folder or list in Shared with me (FR-07.13). App-only (X-03). */
export const shareSaveLinkSchema = z.object({
  mutationId,
  name: z.literal("share.saveLink"),
  args: saveLinkArgsSchema,
});

/** `share.removeReference`: drops a folder or list from Shared with me (FR-07.13). App-only (X-03). */
export const shareRemoveReferenceSchema = z.object({
  mutationId,
  name: z.literal("share.removeReference"),
  args: removeReferenceArgsSchema,
});

/** `account.setDisplayName`: sets or clears the display name (FR-11.3, TS-34). App-only (X-03). */
export const accountSetDisplayNameSchema = z.object({
  mutationId,
  name: z.literal("account.setDisplayName"),
  args: setDisplayNameArgsSchema,
});

export const mutationSchema = z
  .discriminatedUnion("name", [
    albumCreateSchema,
    albumUpdateSchema,
    albumSetArtworkSchema,
    albumCaptureSchema,
    fieldCreateSchema,
    fieldRenameSchema,
    fieldValueApplySchema,
    fieldValueSetSchema,
    fieldValueRemoveSchema,
    fieldChangeTypeSchema,
    fieldAddOptionSchema,
    fieldRenameOptionSchema,
    fieldRemoveOptionSchema,
    fieldDeleteSchema,
    containerCreateSchema,
    containerRenameSchema,
    containerMoveSchema,
    containerDescribeSchema,
    containerDeleteSchema,
    trashRecoverSchema,
    albumDeleteSchema,
    trashPurgeSchema,
    membershipAddSchema,
    membershipRemoveSchema,
    linkSetSchema,
    linkRemoveSchema,
    viewSetSchema,
    defaultsSetSchema,
    orderSetSchema,
    shareInviteSchema,
    shareSetLinkSchema,
    accountSetDisplayNameSchema,
    shareResendInvitationSchema,
    shareAcceptSchema,
    shareDeclineSchema,
    shareLeaveSchema,
    shareRevokeSchema,
    shareSaveLinkSchema,
    shareRemoveReferenceSchema,
    defaultsSetLinkTargetSchema,
    defaultsSetHiddenServicesSchema,
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
      data: syncedAlbumSchema.nullable(),
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
      entity: z.literal("link"),
      id: z
        .string()
        .regex(new RegExp(`^${uuidPattern}:(${streamingServices.join("|")})$`, "i"))
        .meta({ description: "The album's ID and the service, joined by a colon." }),
      op: z.enum(changeOps),
      data: serviceLinkSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("field"),
      id: z.uuid(),
      op: z.enum(changeOps),
      data: customFieldSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("fieldValue"),
      id: z
        .string()
        .regex(new RegExp(`^${uuidPattern}:${uuidPattern}$`, "i"))
        .meta({ description: "The album's ID and the field's, joined by a colon." }),
      op: z.enum(changeOps),
      data: fieldValueSchema.nullable(),
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
      entity: z.literal("trashUnit"),
      id: z.uuid().meta({ description: "The unit's ID." }),
      op: z.enum(changeOps),
      data: trashUnitSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("reference"),
      id: z.uuid().meta({ description: "The shared folder's or list's ID." }),
      op: z.enum(changeOps),
      data: referenceSchema.nullable(),
      mutationId: z.uuid().nullable(),
    }),
    z.object({
      seq: z.int().positive(),
      entity: z.literal("defaults"),
      id: z.uuid().meta({ description: "The account's ID." }),
      op: z.enum(changeOps),
      data: accountDefaultsSchema,
      mutationId: z.uuid().nullable(),
    }),
  ])
  .meta({ description: "A committed change on the account's stream (TS-23)." });
export type Change = z.infer<typeof changeSchema>;

/** The owner's collection at `seq` (TS-24): a client then streams from that cursor. */
export const bootstrapSchema = z
  .object({
    seq: z.int().nonnegative(),
    albums: z.array(syncedAlbumSchema),
    containers: z.array(containerSchema),
    memberships: z.array(membershipSchema),
    links: z
      .array(serviceLinkSchema)
      .meta({ description: "The albums' links to the streaming services (FR-06.2)." }),
    fields: z
      .array(customFieldSchema)
      .meta({ description: "The account's custom fields, with their options (FR-03.6)." }),
    fieldValues: z.array(fieldValueSchema).meta({
      description:
        "The fields each album applies, with their values; null is applied-empty (FR-03.7).",
    }),
    views: z.array(viewPrefsSchema).meta({ description: "The person's remembered view choices." }),
    positions: z
      .array(positionSchema)
      .meta({ description: "The person's manual order: one key per arranged item (TS-16)." }),
    defaults: accountDefaultsSchema.meta({
      description:
        "The person's account defaults, DS-44's until they save their own, and where their links open.",
    }),
    trashUnits: z
      .array(trashUnitSchema)
      .meta({ description: "The owner's Trash, unit by unit (FR-01.12, FR-01.13)." }),
    references: z.array(referenceSchema).meta({
      description:
        "The person's Shared with me: the shared folders and lists they keep, newest first (FR-07.13). `GET /v1/shared` gives their names, owners and availability.",
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
