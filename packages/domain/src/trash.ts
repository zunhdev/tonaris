// Trash for folders, lists (TON-55) and albums (TON-57; FR-01.11 to FR-01.16, FR-14.1 to FR-14.3, TS-13). Deleting a folder or list
// moves it and its active descendants to Trash as one unit, with one deletion time and an expiry 30 days later;
// anything already in Trash keeps its own unit. Memberships stay stored but stop being effective, so an album in no
// other active list enters Unsorted, at its top (DS-51). Clients hold active content only: deletion sends the
// removals, recovery the returns. Recovery returns a unit to its root's parent, or asks for a destination when that
// parent isn't active, and for another name when its name is taken there (TS-26). An album is deleted on its own, as
// its own unit, keeping everything for its restore: its entries in still-active lists come back, those in trashed
// lists are reported, and with none it goes to Unsorted. A restore that would make a second active record of the same
// album pauses instead, naming it, and changes nothing (FR-14.3).

import { albumOf, changeableAlbum } from "./albums";
import type { CollectionStore } from "./collection-store";
import { actingOwner, applied, isFailure } from "./command-kit";
import type { ChangeInput, CommandContext, CommandResult } from "./commands";
import {
  changeableContainer,
  containerKinds,
  containerNameProblem,
  containerOf,
  destinationPath,
  tooDeep,
  type Container,
} from "./containers";
import { fieldValueKey } from "./field-values";
import { maxContainerDepth, trashRetentionDays } from "./limits";
import { membershipKey, type Membership } from "./memberships";
import { findNameConflict } from "./names";
import { failure } from "./outcomes";
import { authorizeWrite } from "./policies";
import { forgetPlace, placeAtTop } from "./positions";
import { actingUserId } from "./principals";
import { serviceLinkKey } from "./service-links";
import { z } from "./zod";

export const trashUnitKinds = [...containerKinds, "album"] as const;
export type TrashUnitKind = (typeof trashUnitKinds)[number];

/** A unit of Trash as clients hold it: what it is, when it was deleted and when it expires (FR-01.12, FR-01.13). */
export const trashUnitSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(trashUnitKinds),
    rootId: z.uuid().meta({ description: "The folder, list or album deleted." }),
    name: z.string().meta({ description: "The root's name, or the album's title." }),
    parentId: z.uuid().nullable().meta({
      description:
        "The folder the root was in, null for the root or an album: where recovery returns it if that folder is active (FR-01.15).",
    }),
    deletedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    folders: z.int().nonnegative().meta({ description: "Folders deleted with the root." }),
    lists: z.int().nonnegative().meta({ description: "Lists deleted with the root." }),
    members: z
      .array(
        z.object({
          id: z.uuid(),
          kind: z.enum(containerKinds),
          name: z.string(),
          parentId: z.uuid().nullable(),
        }),
      )
      .meta({
        description:
          "The folders and lists deleted with the root, for the Trash view to show read-only (DS-55); none for an album.",
      }),
    artist: z
      .string()
      .nullable()
      .meta({ description: "An album's artist credit; null otherwise." }),
  })
  .meta({ description: "Content deleted together, recovered and purged as one (FR-01.13)." });
export type TrashUnit = z.infer<typeof trashUnitSchema>;

/**
 * What was purged while a unit still referred to it, so its recovery can report it (TS-13): an album, in a folder's
 * or list's unit, or a list, in an album's unit.
 */
export type Tombstone =
  | { kind?: "album"; id: string; title: string; artist: string }
  | { kind: "list"; id: string; name: string };

/** A unit as the store keeps it. */
export type StoredTrashUnit = {
  id: string;
  ownerId: string;
  kind: TrashUnitKind;
  rootId: string;
  deletedAt: Date;
  expiresAt: Date;
  tombstones: Tombstone[];
};

/** An entry recovery didn't bring back, and why (FR-01.14): its album is in Trash, or gone for good. */
export const skippedEntrySchema = z.object({
  albumId: z.uuid(),
  title: z.string(),
  artist: z.string(),
  listId: z.uuid().nullable().meta({ description: "The list it was in; null when unknown." }),
  listName: z
    .string()
    .nullable()
    .meta({ description: "That list's name, when the client may not hold it: it is in Trash." }),
  reason: z.enum(["album_in_trash", "album_deleted", "list_in_trash", "list_deleted"]),
});
export type SkippedEntry = z.infer<typeof skippedEntrySchema>;

/** `trash.recover`'s `result` in a `confirmed` outcome: the entries it skipped (FR-01.14, DS-56). */
export const recoveryResultSchema = z.object({ skipped: z.array(skippedEntrySchema) });
export type RecoveryResult = z.infer<typeof recoveryResultSchema>;

export const containerDeleteArgsSchema = z.object({
  id: z.uuid(),
  unitId: z.uuid({ version: "v7" }).meta({
    description:
      "The Trash unit's ID, chosen by the client (TS-10), so an undo can name it before the answer arrives.",
  }),
});

export const trashRecoverArgsSchema = z.object({
  unitId: z.uuid(),
  parentId: z.uuid().nullable().optional().meta({
    description:
      "Where to recover the unit's root: a folder, or null for the root. Absent, it returns to its original parent (FR-01.15).",
  }),
  name: z.string().optional().meta({
    description:
      "Another name for the root, when its own is taken where it returns (FR-01.16). Absent, it keeps its name.",
  }),
});

/** Why a unit can't go back to its parent unasked: the parent is gone, or in Trash itself (FR-01.15). */
export type DestinationNeed = {
  unitId: string;
  name: string;
  parentId: string;
  reason: "missing" | "trashed";
};

/** A name taken where the unit returns (FR-01.16). */
export type NameNeed = { unitId: string; name: string; parentId: string | null };

/** The unit as clients see it, from its members as they were deleted. */
export function trashUnitOf(
  unit: Omit<StoredTrashUnit, "tombstones">,
  name: string,
  members: readonly Pick<Container, "id" | "kind" | "parentId" | "name">[],
  artist: string | null = null,
): TrashUnit {
  const below = members.filter((member) => member.id !== unit.rootId);
  return {
    id: unit.id,
    kind: unit.kind,
    rootId: unit.rootId,
    name,
    parentId: members.find((member) => member.id === unit.rootId)?.parentId ?? null,
    deletedAt: unit.deletedAt.toISOString(),
    expiresAt: unit.expiresAt.toISOString(),
    folders: below.filter((member) => member.kind === "folder").length,
    lists: below.filter((member) => member.kind === "list").length,
    members: below.map(({ id, kind, name: memberName, parentId }) => ({
      id,
      kind,
      name: memberName,
      parentId,
    })),
    artist,
  };
}

/** Levels in the unit from its root down, the root included. */
function depthOf(rootId: string, members: readonly Container[]): number {
  const below = members.filter((member) => member.parentId === rootId);
  return 1 + Math.max(0, ...below.map((member) => depthOf(member.id, members)));
}

/** Whether the album is active: not in Trash. */
async function isActive(store: CollectionStore, albumId: string): Promise<boolean> {
  const album = await store.findAlbum(albumId);
  return album !== undefined && !album.trashed;
}

/**
 * `container.delete` (FR-01.11, FR-01.13): moves a folder or list and its active descendants to Trash as the unit
 * `unitId`. The root's place in its parent goes; albums that were only in its lists enter Unsorted at its top. Sent
 * again for the same unit, it changes nothing.
 */
export async function deleteContainer(
  args: z.infer<typeof containerDeleteArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const { store, principal } = context;
  const existing = await store.findTrashUnit(args.unitId);
  if (existing) {
    const sameUnit = existing.rootId === args.id && existing.ownerId === actingUserId(principal);
    if (!sameUnit) {
      return failure("validation_failed", "This ID is already in use.", [
        { path: "args.unitId", message: "Already in use" },
      ]);
    }
    // A resend changes nothing, but only for someone who may make the change (TS-30).
    const decision = authorizeWrite(principal, { ownerId: existing.ownerId, scope: "collection" });
    return decision.allowed
      ? applied()
      : failure(decision.code, "You can't change this folder or list.");
  }
  const container = await changeableContainer(args.id, context);
  if (isFailure(container)) return container;
  const { ownerId } = container;

  const members = await store.activeSubtree(container.id);
  const lists = members.filter((member) => member.kind === "list").map((member) => member.id);
  const entries = await store.listEntries(lists);
  const now = context.now ?? new Date();
  const unit: StoredTrashUnit = {
    id: args.unitId,
    ownerId,
    kind: container.kind,
    rootId: container.id,
    deletedAt: now,
    expiresAt: new Date(now.getTime() + trashRetentionDays * 86_400_000),
    tombstones: [],
  };
  await store.trashContainers(
    unit,
    members.map((member) => member.id),
  );

  // Albums left in no active list enter Unsorted, at its top (DS-51).
  const placed: ChangeInput[] = [];
  for (const albumId of new Set(entries.map((entry) => entry.albumId))) {
    // oxlint-disable-next-line no-await-in-loop
    if ((await isActive(store, albumId)) && !(await store.inActiveList(albumId))) {
      // oxlint-disable-next-line no-await-in-loop
      placed.push(await placeAtTop(store, ownerId, "unsorted", albumId));
    }
  }
  return applied(
    ...members.map((member): ChangeInput => ({
      entity: "container",
      id: member.id,
      op: "delete",
      data: null,
    })),
    ...entries.map((entry): ChangeInput => ({
      entity: "membership",
      id: membershipKey(entry.listId, entry.albumId),
      op: "delete",
      data: null,
    })),
    ...(await forgetPlace(store, ownerId, container.parentId ?? "root", container.id)),
    ...placed,
    {
      entity: "trashUnit",
      id: unit.id,
      op: "insert",
      data: trashUnitOf(unit, container.name, members),
    },
  );
}

/**
 * `trash.recover` (FR-01.14 to FR-01.16, TS-26): returns a unit's folders and lists to `parentId`, or to its root's
 * original parent, named `name` or as before. Without an active parent to return to, it asks for a destination; with
 * the name taken there, for another name. Nothing changes until it can. The recovered lists' entries are effective
 * again for active albums, which leave Unsorted. A unit past its expiry is refused as `expired` (FR-01.17).
 */
export async function recoverUnit(
  args: z.infer<typeof trashRecoverArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const { store, principal } = context;
  const unit = await store.findTrashUnit(args.unitId);
  // Someone else's unit is answered as gone, so nobody can probe for other people's IDs.
  if (!unit || unit.ownerId !== actingUserId(principal)) {
    return failure("not_found", "This is no longer in Trash.");
  }
  const decision = authorizeWrite(principal, { ownerId: unit.ownerId, scope: "collection" });
  if (!decision.allowed) return failure(decision.code, "You can't recover this from Trash.");
  // Expiry is enforced at 30 days, even before the hourly purge removes it (FR-01.17, FR-10.7).
  if (unit.expiresAt.getTime() <= (context.now ?? new Date()).getTime()) {
    return failure(
      "expired",
      "This was in Trash for 30 days and is being removed for good, so it can't be recovered.",
    );
  }
  if (unit.kind === "album") return recoverAlbumUnit(unit, context);
  const { ownerId } = unit;
  const members = await store.unitContainers(unit.id);
  const root = members.find((member) => member.id === unit.rootId);
  if (!root) return failure("not_found", "This is no longer in Trash.");

  const explicit = args.parentId !== undefined;
  const parentId = args.parentId === undefined ? root.parentId : args.parentId;
  const name = (args.name ?? root.name).trim();
  if (parentId !== null && !explicit) {
    const parent = await store.findContainer(parentId);
    if (!parent || parent.ownerId !== ownerId || parent.trashed) {
      const need: DestinationNeed = {
        unitId: unit.id,
        name: root.name,
        parentId,
        reason: parent?.ownerId === ownerId && parent.trashed ? "trashed" : "missing",
      };
      return { status: "needs_input", need: "destination", candidates: [need] };
    }
  }
  const path = await destinationPath(parentId, ownerId, store);
  if (isFailure(path)) return path;
  if (path.length + depthOf(root.id, members) > maxContainerDepth) return tooDeep();
  const problem = containerNameProblem(name);
  if (problem) return problem;
  if (findNameConflict(name, await store.activeChildren(ownerId, parentId))) {
    const need: NameNeed = { unitId: unit.id, name, parentId };
    return { status: "needs_input", need: "name", candidates: [need] };
  }

  const lists = members.filter((member) => member.kind === "list").map((member) => member.id);
  const entries = await store.listEntries(lists);
  const albums = new Map<
    string,
    { active: boolean; unsorted: boolean; title: string; artist: string }
  >();
  for (const albumId of new Set(entries.map((entry) => entry.albumId))) {
    // oxlint-disable-next-line no-await-in-loop
    const album = await store.findAlbum(albumId);
    const active = album !== undefined && !album.trashed;
    albums.set(albumId, {
      active,
      // oxlint-disable-next-line no-await-in-loop
      unsorted: active && !(await store.inActiveList(albumId)),
      title: album?.title ?? "",
      artist: album?.artistCredit ?? "",
    });
  }
  // Moved and renamed while still in Trash, so its old name never meets an active sibling's.
  if (root.parentId !== parentId || root.name !== name) {
    await store.updateContainer(root.id, { parentId, name });
  }
  await store.recoverContainers(
    unit.id,
    members.map((member) => member.id),
  );

  const effective = entries.filter((entry) => albums.get(entry.albumId)?.active);
  const leftUnsorted: ChangeInput[] = [];
  for (const [albumId, state] of albums) {
    if (!state.unsorted) continue;
    // oxlint-disable-next-line no-await-in-loop
    leftUnsorted.push(...(await forgetPlace(store, ownerId, "unsorted", albumId)));
  }
  // What didn't come back: entries whose album is in Trash, and albums gone for good (FR-01.14).
  const result: RecoveryResult = {
    skipped: [
      ...entries.flatMap((entry): SkippedEntry[] => {
        const album = albums.get(entry.albumId);
        if (!album || album.active) return [];
        return [
          {
            albumId: entry.albumId,
            title: album.title,
            artist: album.artist,
            listId: entry.listId,
            listName: null,
            reason: "album_in_trash",
          },
        ];
      }),
      ...unit.tombstones.flatMap((tombstone): SkippedEntry[] =>
        tombstone.kind === "list"
          ? []
          : [
              {
                albumId: tombstone.id,
                title: tombstone.title,
                artist: tombstone.artist,
                listId: null,
                listName: null,
                reason: "album_deleted",
              },
            ],
      ),
    ],
  };
  return {
    status: "applied",
    result,
    changes: [
      ...members.map((member): ChangeInput => ({
        entity: "container",
        id: member.id,
        op: "insert",
        data: containerOf(member.id === root.id ? { ...member, parentId, name } : member),
      })),
      ...effective.map((entry): ChangeInput => ({
        entity: "membership",
        id: membershipKey(entry.listId, entry.albumId),
        op: "insert",
        data: membershipOf(entry),
      })),
      ...leftUnsorted,
      { entity: "trashUnit", id: unit.id, op: "delete", data: null },
    ],
  };
}

const membershipOf = ({ listId, albumId, addedAt }: Membership): Membership => ({
  listId,
  albumId,
  addedAt,
});

export const albumDeleteArgsSchema = z.object({
  id: z.uuid(),
  unitId: z.uuid({ version: "v7" }).meta({
    description: "The Trash unit's ID, chosen by the client (TS-10).",
  }),
});

/**
 * `album.delete` (FR-14.1): moves an album to Trash as its own unit, out of every list and Unsorted, keeping its
 * information, links, field values and entries for its restore. Sent again for the same unit, it changes nothing.
 */
export async function deleteAlbum(
  args: z.infer<typeof albumDeleteArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const { store, principal } = context;
  const existing = await store.findTrashUnit(args.unitId);
  if (existing) {
    if (existing.rootId !== args.id || existing.ownerId !== actingUserId(principal)) {
      return failure("validation_failed", "This ID is already in use.", [
        { path: "args.unitId", message: "Already in use" },
      ]);
    }
    // A resend changes nothing, but only for someone who may make the change (TS-30).
    const decision = authorizeWrite(principal, { ownerId: existing.ownerId, scope: "collection" });
    return decision.allowed ? applied() : failure(decision.code, "You can't change this album.");
  }
  const album = await changeableAlbum(args.id, context);
  if (isFailure(album)) return album;
  if (album.trashed) return failure("trashed", "This album is already in Trash.");
  const { ownerId } = album;

  const entries = await store.entriesOfAlbum(album.id);
  const active: string[] = [];
  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop
    const list = await store.findContainer(entry.listId);
    if (list && !list.trashed) active.push(entry.listId);
  }
  const unsorted = active.length === 0;
  const now = context.now ?? new Date();
  const unit: StoredTrashUnit = {
    id: args.unitId,
    ownerId,
    kind: "album",
    rootId: album.id,
    deletedAt: now,
    expiresAt: new Date(now.getTime() + trashRetentionDays * 86_400_000),
    tombstones: [],
  };
  await store.trashAlbum(unit, album.id);
  // Its places go: it comes back as new (DS-51).
  const places: ChangeInput[] = [];
  for (const viewKey of unsorted ? ["unsorted"] : active) {
    // oxlint-disable-next-line no-await-in-loop
    places.push(...(await forgetPlace(store, ownerId, viewKey, album.id)));
  }
  return applied(
    { entity: "album", id: album.id, op: "delete", data: null },
    ...active.map((listId): ChangeInput => ({
      entity: "membership",
      id: membershipKey(listId, album.id),
      op: "delete",
      data: null,
    })),
    ...places,
    {
      entity: "trashUnit",
      id: unit.id,
      op: "insert",
      data: trashUnitOf(unit, album.title, [], album.artistCredit),
    },
  );
}

/** An active album the restore would duplicate (FR-14.3), as `needs_input` `match` names it. */
export type SameAlbum = {
  unitId: string;
  albumId: string;
  title: string;
  artistCredit: string;
  originalYear: number | null;
};

/**
 * Restores an album unit (FR-14.2, FR-14.3): its entries in still-active lists come back, those in trashed lists are
 * reported, and with none it enters Unsorted at its top. With an active album of the same release group, it pauses
 * as `needs_input` `match`, naming it, and changes nothing.
 */
async function recoverAlbumUnit(
  unit: StoredTrashUnit,
  context: CommandContext,
): Promise<CommandResult> {
  const { store } = context;
  const { ownerId } = unit;
  const album = await store.findCaptureTarget(unit.rootId);
  if (!album || !album.trashed) return failure("not_found", "This is no longer in Trash.");
  if (album.releaseGroupId) {
    const same = (await store.albumsOfReleaseGroup(ownerId, album.releaseGroupId)).filter(
      (each) => !each.trashed && each.id !== album.id,
    );
    if (same.length > 0) {
      const candidates = same.map((each): SameAlbum => ({
        unitId: unit.id,
        albumId: each.id,
        title: each.title,
        artistCredit: each.artistCredit,
        originalYear: each.originalYear,
      }));
      return { status: "needs_input", need: "match", candidates };
    }
  }

  const entries = await store.entriesOfAlbum(album.id);
  const back: Membership[] = [];
  const skipped: SkippedEntry[] = [];
  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop
    const list = await store.findContainer(entry.listId);
    if (list && !list.trashed) back.push(entry);
    else if (list) {
      skipped.push({
        albumId: album.id,
        title: album.title,
        artist: album.artistCredit,
        listId: list.id,
        listName: list.name,
        reason: "list_in_trash",
      });
    }
  }
  for (const tombstone of unit.tombstones) {
    if (tombstone.kind !== "list") continue;
    skipped.push({
      albumId: album.id,
      title: album.title,
      artist: album.artistCredit,
      listId: tombstone.id,
      listName: tombstone.name,
      reason: "list_deleted",
    });
  }
  await store.recoverAlbum(unit.id, album.id);
  // With no list to return to, it enters Unsorted at its top (FR-14.2, DS-51).
  const placed = back.length === 0 ? [await placeAtTop(store, ownerId, "unsorted", album.id)] : [];
  const result: RecoveryResult = { skipped };
  return {
    status: "applied",
    result,
    changes: [
      {
        entity: "album",
        id: album.id,
        op: "insert",
        data: albumOf(album),
      },
      ...back.map((entry): ChangeInput => ({
        entity: "membership",
        id: membershipKey(entry.listId, entry.albumId),
        op: "insert",
        data: membershipOf(entry),
      })),
      ...placed,
      { entity: "trashUnit", id: unit.id, op: "delete", data: null },
    ],
  };
}

export const trashPurgeArgsSchema = z.object({
  unitIds: z.array(z.uuid()).min(1).max(5_000).meta({
    description:
      "The units to remove for good: those the owner confirmed, or all of Trash for Empty Trash.",
  }),
});

/** `trash.purge`'s `result` in a `confirmed` outcome: the units removed, and those already gone (FR-01.18). */
export const purgeResultSchema = z.object({
  purged: z.array(z.uuid()),
  gone: z
    .array(z.uuid())
    .meta({ description: "Units no longer in Trash: recovered or purged before." }),
});
export type PurgeResult = z.infer<typeof purgeResultSchema>;

/**
 * Removes one unit for good (FR-01.17, FR-01.18, TS-13). A folder's or list's: its folders and lists and their
 * entries; albums stay where else they are, and an album in Trash that was in one of its lists keeps a tombstone of
 * that list. An album's: the album, with its entries, links and values, and a tombstone in every unit still referring
 * to it. Answers the changes for clients.
 */
export async function purgeUnit(
  store: CollectionStore,
  unit: StoredTrashUnit,
): Promise<ChangeInput[]> {
  const gone: ChangeInput = { entity: "trashUnit", id: unit.id, op: "delete", data: null };
  if (unit.kind === "album") {
    const album = await store.findAlbum(unit.rootId);
    if (album) {
      const tombstone: Tombstone = { id: album.id, title: album.title, artist: album.artistCredit };
      for (const unitId of await store.unitsReferencingAlbum(album.id)) {
        // oxlint-disable-next-line no-await-in-loop
        await store.addTombstone(unitId, tombstone);
      }
    }
    const removed = await store.purgeAlbum(unit.id, unit.rootId);
    // Clients hold the album's links and values, as of an album in Trash: they go too.
    return [
      ...removed.services.map((service): ChangeInput => ({
        entity: "link",
        id: serviceLinkKey(unit.rootId, service),
        op: "delete",
        data: null,
      })),
      ...removed.fieldIds.map((fieldId): ChangeInput => ({
        entity: "fieldValue",
        id: fieldValueKey(unit.rootId, fieldId),
        op: "delete",
        data: null,
      })),
      gone,
    ];
  }
  const members = await store.unitContainers(unit.id);
  const lists = members.filter((member) => member.kind === "list");
  const entries = await store.listEntries(lists.map((list) => list.id));
  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop
    const album = await store.findAlbum(entry.albumId);
    // oxlint-disable-next-line no-await-in-loop
    const albumUnit = album?.trashed ? await store.albumUnit(album.id) : undefined;
    const list = lists.find((each) => each.id === entry.listId);
    if (albumUnit && list) {
      // oxlint-disable-next-line no-await-in-loop
      await store.addTombstone(albumUnit, { kind: "list", id: list.id, name: list.name });
    }
  }
  await store.purgeContainers(
    unit.id,
    members.map((member) => member.id),
  );
  return [gone];
}

/**
 * `trash.purge` (FR-01.18, FR-14.5): removes the owner's units for good, early, as confirmed in the app; never through
 * MCP (X-03). Units already gone are reported, and the rest still go (FR-13.4).
 */
export async function purgeUnits(
  args: z.infer<typeof trashPurgeArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = actingOwner(context, "trash_purge", "Only the app can empty Trash.");
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  const result: PurgeResult = { purged: [], gone: [] };
  const changes: ChangeInput[] = [];
  for (const unitId of new Set(args.unitIds)) {
    // oxlint-disable-next-line no-await-in-loop
    const unit = await store.findTrashUnit(unitId);
    if (!unit || unit.ownerId !== ownerId) {
      result.gone.push(unitId);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop
    changes.push(...(await purgeUnit(store, unit)));
    result.purged.push(unitId);
  }
  return { status: "applied", changes, result };
}
