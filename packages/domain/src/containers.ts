// Folders and lists as clients hold them (TS-11, TS-24), and the commands that create, rename and move them
// (TON-26) and describe them (TON-54). The albums in lists are memberships.ts.

import type { ChangeInput, CollectionStore, CommandContext, CommandResult } from "./commands";
import { maxContainerDepth, maxContainers, maxDescriptionLength, maxNameLength } from "./limits";
import { findNameConflict, isBlankName } from "./names";
import { failure, type Failure } from "./outcomes";
import { authorizeWrite } from "./policies";
import { forgetPlace } from "./positions";
import { actingUserId } from "./principals";
import { z } from "./zod";

export const containerKinds = ["folder", "list"] as const;
export type ContainerKind = (typeof containerKinds)[number];

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
  })
  .meta({ description: "A folder or list, with its description (FR-01.1, FR-03.5)." });
export type Container = z.infer<typeof containerSchema>;

/** A container as the store keeps it: with its owner, and whether it is in Trash (TS-13). */
export type StoredContainer = Container & { ownerId: string; trashed: boolean };

const applied = (...changes: ChangeInput[]): CommandResult => ({ status: "applied", changes });

/** The container as clients see it. */
function containerOf({ id, kind, parentId, name, description }: Container): Container {
  return { id, kind, parentId, name, description };
}

/** Code points rather than graphemes: the limit bounds stored text (TS-18). */
// oxlint-disable-next-line no-misused-spread
const longerThan = (text: string, limit: number) => [...text].length > limit;

/** The refusal of a description over the limit (FR-03.5, TS-18). Clients check it too, with these words. */
export const descriptionTooLong = `Descriptions can be at most ${maxDescriptionLength.toLocaleString("en")} characters.`;

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
  // Code points rather than graphemes: the limit bounds stored text, and a grapheme can hold any number of them.
  // oxlint-disable-next-line no-misused-spread
  if ([...name].length > maxNameLength) {
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
async function destinationPath(
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

const tooDeep = () =>
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
 * Creates a folder or list with the client's ID (TS-10), at the root or in an active folder (FR-01.1). A create
 * sent again without its idempotency record duplicates nothing (FR-13.5): the same values are already saved,
 * and different ones are a conflict.
 */
export async function createContainer(
  args: ContainerFields,
  { principal, store }: CommandContext,
): Promise<CommandResult> {
  const ownerId = actingUserId(principal);
  const decision = authorizeWrite(principal, { ownerId: ownerId ?? "", scope: "collection" });
  if (!ownerId || !decision.allowed) {
    return failure(
      decision.allowed ? "permission_denied" : decision.code,
      "You can't add folders or lists here.",
    );
  }
  // A new folder or list has no description until one is set (FR-03.5).
  const container = containerOf({ ...args, name: args.name.trim(), description: null });
  const problem = containerNameProblem(container.name);
  if (problem) return problem;

  const existing = await store.findContainer(container.id);
  if (existing) {
    if (existing.ownerId !== ownerId) {
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
  if (!Array.isArray(path)) return path;
  if (path.length + 1 > maxContainerDepth) return tooDeep();
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

/** The owner's active container `id`, or why it can't be changed. */
async function changeableContainer(
  id: string,
  { principal, store }: CommandContext,
): Promise<StoredContainer | Failure> {
  const container = await store.findContainer(id);
  if (!container) return failure("not_found", "This folder or list doesn't exist.");
  const decision = authorizeWrite(principal, { ownerId: container.ownerId, scope: "collection" });
  if (!decision.allowed) return failure(decision.code, "You can't change this folder or list.");
  if (container.trashed) {
    return failure("trashed", "This folder or list is in Trash. Recover it to change it.");
  }
  return container;
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
  if ("status" in container) return container;
  const renamed = name.trim();
  const problem = containerNameProblem(renamed);
  if (problem) return problem;
  if (container.name !== base.name) {
    return {
      status: "conflict",
      conflicts: [{ field: "name", current: container.name, attempted: renamed, base: base.name }],
    };
  }
  if (renamed === container.name) return applied();

  const { ownerId, parentId } = container;
  const taken = await siblingConflict(renamed, { ownerId, parentId, selfId: id }, context.store);
  if (taken) return taken;

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
  if ("status" in container) return container;
  if (container.parentId !== base.parentId) {
    return {
      status: "conflict",
      conflicts: [
        {
          field: "parentId",
          current: container.parentId,
          attempted: parentId,
          base: base.parentId,
        },
      ],
    };
  }
  if (parentId === container.parentId) return applied();

  const { store } = context;
  const path = await destinationPath(parentId, container.ownerId, store);
  if (!Array.isArray(path)) return path;
  if (path.includes(id)) {
    return failure("cycle", "A folder can't move into itself or a folder inside it.");
  }
  if (path.length + (await store.subtreeDepth(id)) > maxContainerDepth) return tooDeep();
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
  if ("status" in container) return container;
  const text = description?.trim() ?? "";
  const described = text === "" ? null : text;
  if (described !== null && longerThan(described, maxDescriptionLength)) {
    return failure("validation_failed", descriptionTooLong, [
      { path: "args.description", message: `At most ${maxDescriptionLength} characters` },
    ]);
  }
  if (container.description !== base.description) {
    return {
      status: "conflict",
      conflicts: [
        {
          field: "description",
          current: container.description,
          attempted: described,
          base: base.description,
        },
      ],
    };
  }
  if (described === container.description) return applied();

  await context.store.updateContainer(id, { description: described });
  const data = containerOf({ ...container, description: described });
  return applied({ entity: "container", id, op: "update", data });
}
