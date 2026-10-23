// The commands a mutation runs (TS-20 step 4): authorization, invariants and field-level compare-and-set
// (TS-21), against a store the database layer implements inside the owner's write transaction (TS-02).
// A command decides; it never commits. Rejections change nothing (X-05).

import { albumFields, albumProblem, type Album, type AlbumField, type AlbumFields } from "./albums";
import {
  createContainer,
  moveContainer,
  renameContainer,
  type Container,
  type StoredContainer,
} from "./containers";
import { addMembership, removeMembership, type Membership } from "./memberships";
import { failure, type FieldConflict, type Outcome } from "./outcomes";
import { authorizeWrite } from "./policies";
import { actingUserId, type Principal } from "./principals";
import type { ChangeOp, Mutation } from "./sync";
import { setDefaults, setView, type ViewDefaults, type ViewPrefs } from "./views";

/** An album as the store keeps it: with its owner, and whether it is in Trash (TS-13). */
export type StoredAlbum = Album & { ownerId: string; trashed: boolean };

/** What commands read and write. The database layer implements it on the owner's write transaction. */
export type CollectionStore = {
  /** The album with this ID, whoever owns it, in Trash or not. */
  findAlbum(id: string): Promise<StoredAlbum | undefined>;
  insertAlbum(album: Album & { ownerId: string }): Promise<void>;
  /** Sets the fields in `values`; fields left undefined keep their value. */
  updateAlbum(id: string, values: Partial<AlbumFields>): Promise<void>;

  /** The folder or list with this ID, whoever owns it, in Trash or not. */
  findContainer(id: string): Promise<StoredContainer | undefined>;
  /** The container's ID and its ancestors' up to the root, nearest first: its level is the length (TS-31). */
  containerPath(id: string): Promise<string[]>;
  /** Levels of active containers from this one down, itself included: 1 for a list or an empty folder. */
  subtreeDepth(id: string): Promise<number>;
  /** The owner's active folders and lists directly under `parentId`; null is the root. */
  activeChildren(ownerId: string, parentId: string | null): Promise<Container[]>;
  /** The owner's folders and lists, those in Trash included (TS-18). */
  countContainers(ownerId: string): Promise<number>;
  insertContainer(container: Container & { ownerId: string }): Promise<void>;
  /** Sets the fields in `values`; fields left undefined keep their value. */
  updateContainer(id: string, values: Partial<Pick<Container, "name" | "parentId">>): Promise<void>;

  /** The entry for this album in this list, whether or not either is in Trash. */
  findMembership(listId: string, albumId: string): Promise<Membership | undefined>;
  /** The owner's list entries, those whose list or album is in Trash included (TS-18). */
  countMemberships(ownerId: string): Promise<number>;
  insertMembership(membership: Membership & { ownerId: string }): Promise<void>;
  deleteMembership(listId: string, albumId: string): Promise<void>;

  /** The person's remembered choices for the view, if they made any (FR-11.7). */
  findViewPrefs(personId: string, viewKey: string): Promise<ViewPrefs | undefined>;
  /** Inserts or replaces the person's choices for `prefs.viewKey`. */
  saveViewPrefs(personId: string, prefs: ViewPrefs): Promise<void>;
  deleteViewPrefs(personId: string, viewKey: string): Promise<void>;
  /** The account defaults the person saved, if they saved any. */
  findDefaults(personId: string): Promise<ViewDefaults | undefined>;
  /** Inserts or replaces the person's account defaults. */
  saveDefaults(personId: string, defaults: ViewDefaults): Promise<void>;
};

/** A change for the account's log; the database layer gives it its `seq`. */
export type ChangeInput =
  | { entity: "album"; id: string; op: ChangeOp; data: Album | null }
  | { entity: "container"; id: string; op: ChangeOp; data: Container | null }
  | { entity: "membership"; id: string; op: ChangeOp; data: Membership | null }
  | { entity: "view"; id: string; op: ChangeOp; data: ViewPrefs | null }
  | { entity: "defaults"; id: string; op: ChangeOp; data: ViewDefaults };

/** `result` is what the mutation reports in its `confirmed` outcome, if anything, such as `MembershipAddResult`. */
export type CommandResult =
  | { status: "applied"; changes: ChangeInput[]; result?: unknown }
  | Extract<Outcome, { status: "failed" | "conflict" }>;

/** `now` is the time a command records, such as when an album joined a list; the current time if absent. */
export type CommandContext = { principal: Principal; store: CollectionStore; now?: Date };

export function runCommand(mutation: Mutation, context: CommandContext): Promise<CommandResult> {
  if (mutation.name === "album.create") return createAlbum(mutation.args, context);
  if (mutation.name === "album.update") return updateAlbum(mutation.args, mutation.base, context);
  if (mutation.name === "container.create") return createContainer(mutation.args, context);
  if (mutation.name === "container.rename") {
    return renameContainer(mutation.args, mutation.base, context);
  }
  if (mutation.name === "container.move") {
    return moveContainer(mutation.args, mutation.base, context);
  }
  if (mutation.name === "membership.add") return addMembership(mutation.args, context);
  if (mutation.name === "membership.remove") return removeMembership(mutation.args, context);
  if (mutation.name === "view.set") return setView(mutation.args, mutation.base, context);
  return setDefaults(mutation.args, mutation.base, context);
}

const applied = (...changes: ChangeInput[]): CommandResult => ({ status: "applied", changes });

/** The album as clients see it, without the owner and Trash state. */
function albumOf(stored: StoredAlbum): Album {
  const { ownerId: _, trashed: __, ...album } = stored;
  return album;
}

/**
 * Creates an album with the client's ID (TS-10). If that album already exists for the same owner, as when a
 * create is sent again without its idempotency record, nothing is duplicated (FR-13.5): the same values are
 * already saved, and different ones are a conflict.
 */
async function createAlbum(
  args: Album,
  { principal, store }: CommandContext,
): Promise<CommandResult> {
  const ownerId = actingUserId(principal);
  const decision = authorizeWrite(principal, { ownerId: ownerId ?? "", scope: "collection" });
  if (!ownerId || !decision.allowed) {
    return failure(
      decision.allowed ? "permission_denied" : decision.code,
      "You can't add albums here.",
    );
  }
  const problem = albumProblem(args);
  if (problem) return problem;

  const existing = await store.findAlbum(args.id);
  if (existing) {
    if (existing.ownerId !== ownerId) {
      return failure("validation_failed", "This album ID is already in use.", [
        { path: "args.id", message: "Already in use" },
      ]);
    }
    const conflicts = albumFields
      .filter((field) => existing[field] !== args[field])
      .map((field) => ({ field, current: existing[field], attempted: args[field] }));
    return conflicts.length > 0 ? { status: "conflict", conflicts } : applied();
  }

  await store.insertAlbum({ ...args, ownerId });
  return applied({ entity: "album", id: args.id, op: "insert", data: args });
}

/**
 * Changes the fields in `args` if each still holds its `base` value (TS-21). Fields not named are never
 * compared, so edits to different fields of one album all succeed.
 */
async function updateAlbum(
  { id, ...values }: Partial<AlbumFields> & { id: string },
  base: Partial<AlbumFields>,
  { principal, store }: CommandContext,
): Promise<CommandResult> {
  const album = await store.findAlbum(id);
  if (!album) return failure("not_found", "This album doesn't exist.");
  const decision = authorizeWrite(principal, { ownerId: album.ownerId, scope: "collection" });
  if (!decision.allowed) return failure(decision.code, "You can't change this album.");

  const changed = albumFields.filter((field) => values[field] !== undefined);
  if (changed.length === 0) {
    return failure("validation_failed", "The mutation changes nothing.", [
      { path: "args", message: "Name at least one field" },
    ]);
  }
  const unbased = changed.filter((field) => base[field] === undefined);
  const extra = albumFields.filter(
    (field) => base[field] !== undefined && !changed.includes(field),
  );
  if (unbased.length > 0 || extra.length > 0) {
    return failure(
      "validation_failed",
      "`base` must hold the prior value of exactly the changed fields.",
      [
        ...unbased.map((field) => ({ path: `base.${field}`, message: "Required" })),
        ...extra.map((field) => ({
          path: `base.${field}`,
          message: "Not changed by this mutation",
        })),
      ],
    );
  }

  const conflicts: FieldConflict[] = changed
    .filter((field) => album[field] !== base[field])
    .map((field: AlbumField) => ({
      field,
      current: album[field],
      attempted: values[field],
      base: base[field],
    }));
  if (conflicts.length > 0) return { status: "conflict", conflicts };

  const next = albumOf({ ...album, ...values, id });
  const problem = albumProblem(next);
  if (problem) return problem;

  await store.updateAlbum(id, values);
  return applied({ entity: "album", id, op: "update", data: next });
}
