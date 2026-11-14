// Folders and lists as clients hold them (TS-11, TS-24), and the commands that create, rename and move them
// (TON-26), describe them (TON-54) and color them (TON-175). The albums in lists are memberships.ts.

import type { CollectionStore } from "./collection-store";
import {
  applied,
  collectionFor,
  conflict,
  contentAccess,
  insideShare,
  moveStaysInShare,
  isFailure,
  shareTopRefusal,
  type ContentAccess,
} from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import { exceedsMaxDepth, moveCheck } from "./container-tree";
import { maxContainerDepth, maxContainers, maxDescriptionLength, maxNameLength } from "./limits";
import { exceedsLength, findNameConflict, isBlankName } from "./names";
import { failure, type Failure } from "./outcomes";
import { forgetPlace } from "./positions";
import { actingUserId } from "./principals";
import { z } from "./zod";

export const containerKinds = ["folder", "list"] as const;
export type ContainerKind = (typeof containerKinds)[number];

/** The colors a folder or list can have (DS-27, TON-175): a fixed palette tuned for the dark theme. */
export const containerColors = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;
export type ContainerColor = (typeof containerColors)[number];

/** A folder or list as `container.create` takes it. `parentId` null is the root (FR-01.3). */
export const containerFieldsSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(containerKinds),
    parentId: z.uuid().nullable(),
    name: z.string(),
  })
  .meta({ description: "A folder or list (FR-01.1)." });
export type ContainerFields = z.infer<typeof containerFieldsSchema>;

/** A folder or list as clients hold it: with its description, null for none (FR-03.5). */
export const containerSchema = containerFieldsSchema
  .extend({
    description: z
      .string()
      .nullable()
      .meta({ description: "Plain text, null for none (FR-03.5). Not searched (FR-12.4)." }),
    color: z.enum(containerColors).nullable().meta({
      description:
        "Its own color, null for none: without one it takes the nearest folder's above it (TON-175).",
    }),
  })
  .meta({ description: "A folder or list, with its description and color (FR-01.1, FR-03.5)." });
export type Container = z.infer<typeof containerSchema>;

/** A container as the store keeps it: with its owner, and whether it is in Trash (TS-13). */
export type StoredContainer = Container & { ownerId: string; trashed: boolean };

/** The container as clients see it. */
export function containerOf({
  id,
  kind,
  parentId,
  name,
  description,
  color,
}: Container): Container {
  return { id, kind, parentId, name, description, color };
}

/** The refusal of a description over the limit (FR-03.5, TS-18). Clients check it too, with these words. */
export const descriptionTooLong = `Descriptions can be at most ${maxDescriptionLength.toLocaleString("en")} characters.`;

/**
 * Why `text`, already trimmed, can't describe a folder or list, if it can't (FR-03.5, TS-18). Empty text clears the
 * description. Clients check it before sending too, with the same words.
 */
export function descriptionProblem(text: string): Failure | undefined {
  if (!exceedsLength(text, maxDescriptionLength)) return undefined;
  return failure("validation_failed", descriptionTooLong, [
    { path: "args.description", message: `At most ${maxDescriptionLength} characters` },
  ]);
}

/**
 * Why `name`, already trimmed, can't name a folder or list, if it can't (X-06, TS-18). Clients check it before
 * sending too, with the same words.
 */
export function containerNameProblem(name: string): Failure | undefined {
  if (isBlankName(name)) {
    return failure("validation_failed", "Give the folder or list a name.", [
      { path: "args.name", message: "Required" },
    ]);
  }
  if (exceedsLength(name, maxNameLength)) {
    return failure("validation_failed", `Names can be at most ${maxNameLength} characters.`, [
      { path: "args.name", message: `At most ${maxNameLength} characters` },
    ]);
  }
  return undefined;
}

/**
 * Where a container of `ownerId` may go: the root, or an active folder of theirs (FR-01.1, FR-01.4, FR-01.5).
 * Answers the destination's path (empty for the root), or why it can't be one. A missing folder and someone
 * else's get the same answer, so nobody can probe for other people's IDs.
 */
export async function destinationPath(
  parentId: string | null,
  ownerId: string,
  store: CollectionStore,
): Promise<string[] | Failure> {
  if (parentId === null) return [];
  const parent = await store.findContainer(parentId);
  if (!parent || parent.ownerId !== ownerId || parent.trashed) {
    return failure(
      "invalid_destination",
      "That folder isn't available. Choose another folder or the top level.",
    );
  }
  if (parent.kind === "list") {
    return failure(
      "invalid_destination",
      "Lists can't hold folders or lists. Choose a folder or the top level.",
    );
  }
  return store.containerPath(parentId);
}

export const tooDeep = () =>
  failure(
    "limit_exceeded",
    `Folders and lists can be nested up to ${maxContainerDepth} levels deep.`,
  );

/** The active sibling under `parentId` that already has `name`, as a rejection (FR-01.2, X-06). */
async function siblingConflict(
  name: string,
  { ownerId, parentId, selfId }: { ownerId: string; parentId: string | null; selfId?: string },
  store: CollectionStore,
): Promise<Failure | undefined> {
  const taken = findNameConflict(name, await store.activeChildren(ownerId, parentId), selfId);
  if (!taken) return undefined;
  const parent = parentId === null ? undefined : await store.findContainer(parentId);
  return nameTakenProblem(taken.name, parent?.name ?? null);
}

/**
 * The refusal of a name a sibling already has, worded as DS-107 has it: the name, where it is taken (in the folder
 * named `parentName`, or at the top level), and one way forward. Clients check it before sending too.
 */
export function nameTakenProblem(takenName: string, parentName: string | null): Failure {
  const where = parentName === null ? "at the top level" : `in ${parentName}`;
  return failure("name_conflict", `'${takenName}' already exists ${where}. Choose another name.`, [
    { path: "args.name", message: "Already used here" },
  ]);
}

/**
 * Creates a folder or list with the client's ID (TS-10), at the root or in an active folder (FR-01.1): the person's
 * own, or one someone shared with them to edit, whose collection it then joins (FR-07.19). A create sent again without
 * its idempotency record duplicates nothing (FR-13.5): the same values are already saved, and different ones are a
 * conflict.
 */
export async function createContainer(
  args: ContainerFields,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = await collectionFor(
    context,
    args.parentId,
    "You can't add folders or lists here.",
  );
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  // A new folder or list has no description or color until one is set (FR-03.5, TON-175).
  const container = containerOf({
    ...args,
    name: args.name.trim(),
    description: null,
    color: null,
  });
  const problem = containerNameProblem(container.name);
  if (problem) return problem;

  const existing = await store.findContainer(container.id);
  if (existing) {
    // An editor is told only that an ID they can't see is taken, never what holds it (FR-07.20).
    const actor = actingUserId(context.principal);
    const unseen =
      actor !== undefined &&
      actor !== ownerId &&
      (await store.editSourcesAbove(actor, existing.id)).length === 0;
    if (existing.ownerId !== ownerId || unseen) {
      return failure("validation_failed", "This ID is already in use.", [
        { path: "args.id", message: "Already in use" },
      ]);
    }
    const conflicts = (["kind", "parentId", "name"] as const)
      .filter((field) => existing[field] !== container[field])
      .map((field) => ({ field, current: existing[field], attempted: container[field] }));
    return conflicts.length > 0 ? { status: "conflict", conflicts } : applied();
  }

  const path = await destinationPath(container.parentId, ownerId, store);
  if (isFailure(path)) return path;
  if (exceedsMaxDepth(path.length, 1)) return tooDeep();
  const taken = await siblingConflict(container.name, { ...container, ownerId }, store);
  if (taken) return taken;
  if ((await store.countContainers(ownerId)) >= maxContainers) {
    return failure(
      "limit_exceeded",
      `You've reached ${maxContainers.toLocaleString("en")} folders and lists (including Trash). Permanently delete some from Trash to add more.`,
    );
  }

  await store.insertContainer({ ...container, ownerId });
  return applied({ entity: "container", id: container.id, op: "insert", data: container });
}

/**
 * The active container `id`, with how the principal may change it: its owner's, or one shared with them to edit
 * (FR-07.19); or why it can't be changed (TS-30).
 */
export async function changeableContainer(
  id: string,
  context: CommandContext,
): Promise<(StoredContainer & { access: ContentAccess }) | Failure> {
  const container = await context.store.findContainer(id);
  const missing = "This folder or list doesn't exist.";
  if (!container) return failure("not_found", missing);
  const access = await contentAccess(context, container, {
    refusal: "You can't change this folder or list.",
    missing,
    what: "this folder or list",
  });
  if (isFailure(access)) return access;
  if (container.trashed) {
    return failure("trashed", "This folder or list is in Trash. Recover it to change it.");
  }
  // A copy, so the store's own record never carries the access.
  return { ...container, access };
}

/**
 * Renames a folder or list whose name is still `base.name` (FR-01.3, TS-21). A case-only rename is allowed, and
 * the new name must be free among its siblings (FR-01.2).
 */
export async function renameContainer(
  { id, name }: { id: string; name: string },
  base: { name: string },
  context: CommandContext,
): Promise<CommandResult> {
  const container = await changeableContainer(id, context);
  if (isFailure(container)) return container;
  const renamed = name.trim();
  const problem = containerNameProblem(renamed);
  if (problem) return problem;
  if (container.name !== base.name) return conflict("name", container.name, renamed, base.name);
  if (renamed === container.name) return applied();

  const { ownerId, parentId, access } = container;
  const taken = await siblingConflict(renamed, { ownerId, parentId, selfId: id }, context.store);
  if (taken) {
    // The shared folder's or list's siblings are its owner's, outside the share: an editor learns only that the name
    // is taken, not which one or in which folder (FR-07.20).
    if (!insideShare(access, id)) {
      return failure(
        "name_conflict",
        `'${renamed}' is already used where this is kept. Choose another name.`,
        [{ path: "args.name", message: "Already used here" }],
      );
    }
    return taken;
  }

  await context.store.updateContainer(id, { name: renamed });
  const data = containerOf({ ...container, name: renamed });
  return applied({ entity: "container", id, op: "update", data });
}

/**
 * Moves a folder or list whose parent is still `base.parentId` to the root or another active folder (FR-01.4,
 * FR-01.5, TS-21). It keeps its ID, so everything under it comes along and nothing is copied. A folder can't go
 * into itself or anything under it, and nothing may end up deeper than 32 levels. Its owner's place for it in the old
 * parent goes, so it lands at the end of the new parent's arrangement.
 */
export async function moveContainer(
  { id, parentId }: { id: string; parentId: string | null },
  base: { parentId: string | null },
  context: CommandContext,
): Promise<CommandResult> {
  const container = await changeableContainer(id, context);
  if (isFailure(container)) return container;
  // An editor moves things only inside one share, never the shared folder or list itself (FR-07.20). Refused before
  // its base is compared, so the folder above it, which isn't in the share, never shows.
  const { access } = container;
  if (!insideShare(access, id)) return shareTopRefusal();
  if (container.parentId !== base.parentId) {
    return conflict("parentId", container.parentId, parentId, base.parentId);
  }
  if (parentId === container.parentId) return applied();

  const { store } = context;
  if (access.as === "editor") {
    const there = parentId === null ? [] : await store.editSourcesAbove(access.userId, parentId);
    if (!moveStaysInShare(access.through, id, there)) {
      return failure(
        "invalid_destination",
        "It can only move to a folder inside the share it's in. Choose a folder there.",
      );
    }
  }
  const path = await destinationPath(parentId, container.ownerId, store);
  if (isFailure(path)) return path;
  const problem = moveCheck(path, id, await store.subtreeDepth(id));
  if (problem === "cycle") {
    return failure("cycle", "A folder can't move into itself or a folder inside it.");
  }
  if (problem === "too_deep") return tooDeep();
  const { ownerId, name } = container;
  const taken = await siblingConflict(name, { ownerId, parentId, selfId: id }, store);
  if (taken) return taken;

  await store.updateContainer(id, { parentId });
  const data = containerOf({ ...container, parentId });
  // It leaves its place in the old parent's arrangement, and arrives last in the new one, unarranged (DS-51).
  return applied(
    { entity: "container", id, op: "update", data },
    ...(await forgetPlace(store, ownerId, container.parentId ?? "root", id)),
  );
}

/**
 * Sets or clears a folder's or list's description, if it is still `base.description` (FR-03.5, TS-21). It is plain
 * text, trimmed, and empty text clears it. It stays through moves and Trash, as it is part of the record.
 */
export async function describeContainer(
  { id, description }: { id: string; description: string | null },
  base: { description: string | null },
  context: CommandContext,
): Promise<CommandResult> {
  const container = await changeableContainer(id, context);
  if (isFailure(container)) return container;
  const text = description?.trim() ?? "";
  const described = text === "" ? null : text;
  const problem = descriptionProblem(text);
  if (problem) return problem;
  if (container.description !== base.description) {
    return conflict("description", container.description, described, base.description);
  }
  if (described === container.description) return applied();

  await context.store.updateContainer(id, { description: described });
  const data = containerOf({ ...container, description: described });
  return applied({ entity: "container", id, op: "update", data });
}

/**
 * Sets a folder's or list's own color, or clears it with null (TON-175). `base.color` is the one the client last saw
 * (TS-21). Its folders and lists without a color of their own take it, wherever they show.
 */
export async function colorContainer(
  { id, color }: { id: string; color: ContainerColor | null },
  base: { color: ContainerColor | null },
  context: CommandContext,
): Promise<CommandResult> {
  const container = await changeableContainer(id, context);
  if (isFailure(container)) return container;
  if (container.color !== base.color) return conflict("color", container.color, color, base.color);
  if (color === container.color) return applied();
  await context.store.updateContainer(id, { color });
  return applied({
    entity: "container",
    id,
    op: "update",
    data: containerOf({ ...container, color }),
  });
}
