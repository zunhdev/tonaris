// Trash for folders and lists (TON-55; FR-01.11 to FR-01.13, FR-01.15, FR-01.16, TS-13). Deleting a folder or list
// moves it and its active descendants to Trash as one unit, with one deletion time and an expiry 30 days later;
// anything already in Trash keeps its own unit. Memberships stay stored but stop being effective, so an album in no
// other active list enters Unsorted, at its top (DS-51). Clients hold active content only: deletion sends the
// removals, recovery the returns. Recovery returns a unit to its root's parent, or asks for a destination when that
// parent isn't active, and for another name when its name is taken there (TS-26). Album units come with TON-57.

import { trashRetentionDays } from "./approvals";
import type { ChangeInput, CollectionStore, CommandContext, CommandResult } from "./commands";
import {
  changeableContainer,
  containerKinds,
  containerNameProblem,
  containerOf,
  destinationPath,
  tooDeep,
  type Container,
} from "./containers";
import { maxContainerDepth } from "./limits";
import { membershipKey, type Membership } from "./memberships";
import { findNameConflict } from "./names";
import { failure } from "./outcomes";
import { forgetPlace, placeAtTop } from "./positions";
import { actingUserId } from "./principals";
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
    deletedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    folders: z.int().nonnegative().meta({ description: "Folders deleted with the root." }),
    lists: z.int().nonnegative().meta({ description: "Lists deleted with the root." }),
  })
  .meta({ description: "Content deleted together, recovered and purged as one (FR-01.13)." });
export type TrashUnit = z.infer<typeof trashUnitSchema>;

/** A unit as the store keeps it. */
export type StoredTrashUnit = {
  id: string;
  ownerId: string;
  kind: TrashUnitKind;
  rootId: string;
  deletedAt: Date;
  expiresAt: Date;
};

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

const applied = (...changes: ChangeInput[]): CommandResult => ({ status: "applied", changes });

/** The unit as clients see it, from its members as they were deleted. */
export function trashUnitOf(
  unit: StoredTrashUnit,
  name: string,
  members: readonly Pick<Container, "id" | "kind">[],
): TrashUnit {
  const below = members.filter((member) => member.id !== unit.rootId);
  return {
    id: unit.id,
    kind: unit.kind,
    rootId: unit.rootId,
    name,
    deletedAt: unit.deletedAt.toISOString(),
    expiresAt: unit.expiresAt.toISOString(),
    folders: below.filter((member) => member.kind === "folder").length,
    lists: below.filter((member) => member.kind === "list").length,
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
  const { store } = context;
  const existing = await store.findTrashUnit(args.unitId);
  if (existing) {
    const sameUnit =
      existing.rootId === args.id && existing.ownerId === actingUserId(context.principal);
    return sameUnit
      ? applied()
      : failure("validation_failed", "This ID is already in use.", [
          { path: "args.unitId", message: "Already in use" },
        ]);
  }
  const container = await changeableContainer(args.id, context);
  if ("status" in container) return container;
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
 * again for active albums, which leave Unsorted.
 */
export async function recoverUnit(
  args: z.infer<typeof trashRecoverArgsSchema>,
  context: CommandContext,
): Promise<CommandResult> {
  const { store } = context;
  const unit = await store.findTrashUnit(args.unitId);
  if (!unit || unit.ownerId !== actingUserId(context.principal)) {
    return failure("not_found", "This is no longer in Trash.");
  }
  if (unit.kind === "album") {
    return failure("validation_failed", "Albums can't be recovered from Trash yet.");
  }
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
  if (!Array.isArray(path)) return path;
  if (path.length + depthOf(root.id, members) > maxContainerDepth) return tooDeep();
  const problem = containerNameProblem(name);
  if (problem) return problem;
  if (findNameConflict(name, await store.activeChildren(ownerId, parentId))) {
    const need: NameNeed = { unitId: unit.id, name, parentId };
    return { status: "needs_input", need: "name", candidates: [need] };
  }

  const lists = members.filter((member) => member.kind === "list").map((member) => member.id);
  const entries = await store.listEntries(lists);
  const albums = new Map<string, { active: boolean; unsorted: boolean }>();
  for (const albumId of new Set(entries.map((entry) => entry.albumId))) {
    // oxlint-disable-next-line no-await-in-loop
    const active = await isActive(store, albumId);
    // oxlint-disable-next-line no-await-in-loop
    albums.set(albumId, { active, unsorted: active && !(await store.inActiveList(albumId)) });
  }
  await store.recoverContainers(
    unit.id,
    members.map((member) => member.id),
  );
  if (root.parentId !== parentId || root.name !== name) {
    await store.updateContainer(root.id, { parentId, name });
  }

  const effective = entries.filter((entry) => albums.get(entry.albumId)?.active);
  const leftUnsorted: ChangeInput[] = [];
  for (const [albumId, state] of albums) {
    if (!state.unsorted) continue;
    // oxlint-disable-next-line no-await-in-loop
    leftUnsorted.push(...(await forgetPlace(store, ownerId, "unsorted", albumId)));
  }
  return applied(
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
  );
}

const membershipOf = ({ listId, albumId, addedAt }: Membership): Membership => ({
  listId,
  albumId,
  addedAt,
});
