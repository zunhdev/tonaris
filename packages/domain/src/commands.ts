// The commands a mutation runs (TS-20 step 4): authorization, invariants and field-level compare-and-set
// (TS-21), against a store the database layer implements inside the owner's write transaction (TS-02).
// A command decides; it never commits. Rejections change nothing (X-05).

import {
  albumFields,
  albumProblem,
  artworkUrlRefusal,
  isArtworkUrl,
  type Album,
  type AlbumCreateArgs,
  type AlbumField,
  type AlbumFields,
} from "./albums";
import {
  captureAlbum,
  type AlbumOrigin,
  type CapturedLink,
  type CaptureSource,
  type CaptureTarget,
} from "./capture";
import {
  createContainer,
  moveContainer,
  renameContainer,
  type Container,
  type StoredContainer,
} from "./containers";
import type { EnrichmentPlan } from "./enrichment";
import {
  addFieldOption,
  changeFieldType,
  removeFieldOption,
  renameFieldOption,
  type FieldUsage,
  type OptionUser,
} from "./field-options";
import {
  applyField,
  removeField,
  setFieldValue,
  type FieldValue,
  type FieldValueData,
} from "./field-values";
import {
  createField,
  renameField,
  type CustomField,
  type FieldOption,
  type FieldType,
  type StoredField,
} from "./fields";
import type { StreamingService } from "./links";
import { addMembership, removeMembership, type Membership } from "./memberships";
import { failure, type FieldConflict, type Outcome } from "./outcomes";
import { authorizeWrite } from "./policies";
import { placeAtTop, setOrder, type Position } from "./positions";
import { actingUserId, type Principal } from "./principals";
import { removeLink, setLink, type PreparedLink, type ServiceLink } from "./service-links";
import type { ChangeOp, Mutation } from "./sync";
import { setDefaults, setView, type ViewDefaults, type ViewItems, type ViewPrefs } from "./views";

/** An album as the store keeps it: with its owner, and whether it is in Trash (TS-13). */
export type StoredAlbum = Album & { ownerId: string; trashed: boolean };

/** What commands read and write. The database layer implements it on the owner's write transaction. */
export type CollectionStore = {
  /** The album with this ID, whoever owns it, in Trash or not. */
  findAlbum(id: string): Promise<StoredAlbum | undefined>;
  /**
   * Inserts the album. `origin` says where its values came from, and its release group and artwork, for a captured
   * album (TS-15); without it, the values are the person's.
   */
  insertAlbum(album: Album & { ownerId: string }, origin?: AlbumOrigin): Promise<void>;
  /** Sets the fields in `values`, the artwork included; fields left undefined keep their value. */
  updateAlbum(
    id: string,
    values: Partial<AlbumFields & { artworkUrl: string | null }>,
  ): Promise<void>;
  /** The album with its identity and artwork, as capture sees it, whoever owns it, in Trash or not. */
  findCaptureTarget(id: string): Promise<CaptureTarget | undefined>;
  /** The owner's albums saved as `releaseGroupId`, Trash included: active ones first, then by ID (TS-44). */
  albumsOfReleaseGroup(ownerId: string, releaseGroupId: string): Promise<CaptureTarget[]>;
  /** Writes an enrichment plan: its values, release group and provenance (TS-42). */
  fillAlbum(id: string, plan: EnrichmentPlan): Promise<void>;
  /**
   * Takes a trashed album out of Trash for re-addition (FR-14.4, TS-13): its Trash unit goes, and so do its entries in
   * active lists, while those in trashed lists stay for their recovery. Answers the lists it left.
   */
  reactivateAlbum(id: string): Promise<string[]>;
  /** The album's link for `service`, if it has one (FR-06.2). */
  findServiceLink(albumId: string, service: StreamingService): Promise<CapturedLink | undefined>;
  insertServiceLink(albumId: string, ownerId: string, link: CapturedLink): Promise<void>;
  /** Inserts the album's link for `link.service`, or replaces the one it has (FR-06.2). */
  saveServiceLink(albumId: string, ownerId: string, link: CapturedLink): Promise<void>;
  deleteServiceLink(albumId: string, service: StreamingService): Promise<void>;

  /** The custom field with this ID, whoever owns it, with its options in order. */
  findField(id: string): Promise<StoredField | undefined>;
  /** The owner's custom fields, with their options (FR-03.9, TS-18). */
  fieldsOf(ownerId: string): Promise<CustomField[]>;
  /** Inserts the field and its options, each with its fractional-index key (TS-16). */
  insertField(
    field: CustomField & { ownerId: string },
    options: (FieldOption & { sortKey: string })[],
  ): Promise<void>;
  /** Renames the field; its name key follows (TS-12). */
  renameField(id: string, name: string): Promise<void>;
  /** The album's value for the field: undefined when unused, null when applied-empty (FR-03.7). */
  findFieldValue(albumId: string, fieldId: string): Promise<FieldValueData | undefined>;
  /** Applies the field to the album, empty. */
  applyField(albumId: string, fieldId: string): Promise<void>;
  /** Sets the applied field's value, already checked against `field`'s type; null empties it. */
  setFieldValue(albumId: string, field: CustomField, value: FieldValueData): Promise<void>;
  /** Takes the field off the album with its value (FR-03.8). */
  removeField(albumId: string, fieldId: string): Promise<void>;
  /** How many albums apply the field, active and in Trash, even empty (FR-03.12). */
  fieldUsage(fieldId: string): Promise<FieldUsage>;
  /** The albums choosing the option, in Trash or not (FR-03.17). */
  optionUsers(fieldId: string, optionId: string): Promise<OptionUser[]>;
  /** The field an option with this ID belongs to, whoever owns it. */
  optionField(optionId: string): Promise<string | undefined>;
  /** The key of the field's last option, or null without options (TS-16). */
  lastOptionKey(fieldId: string): Promise<string | null>;
  /** Changes the field's type, deleting its options if `discardOptions` (FR-03.13). */
  changeFieldType(fieldId: string, type: FieldType, discardOptions: boolean): Promise<void>;
  /** Adds an option to the field with its fractional-index key. */
  insertFieldOption(fieldId: string, option: FieldOption & { sortKey: string }): Promise<void>;
  /** Relabels the option; its label key follows. */
  renameFieldOption(optionId: string, label: string): Promise<void>;
  /**
   * Deletes the option, clearing it from every album (FR-03.17), and gives the values of `albumIds`, the albums that
   * chose it, as they now are.
   */
  removeFieldOption(fieldId: string, optionId: string, albumIds: string[]): Promise<FieldValue[]>;

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

  /** The person's keys for these items in the view, by item ID (TS-16). */
  findPositions(
    personId: string,
    viewKey: string,
    itemIds: readonly string[],
  ): Promise<Map<string, string>>;
  /** Inserts or replaces the person's key for `position.itemId` in `position.viewKey`. */
  savePosition(personId: string, position: Position): Promise<void>;
  /** Deletes the person's key for the item in the view; answers whether there was one. */
  deletePosition(personId: string, viewKey: string, itemId: string): Promise<boolean>;
  /** The smallest of the person's keys in the view, compared bytewise, if they have any. */
  firstKey(personId: string, viewKey: string): Promise<string | undefined>;
  /**
   * The IDs of what the view holds now: a list's active albums, Unsorted's (the person's active albums in no active
   * list), or a folder's or the root's active folders and lists.
   */
  viewItems(personId: string, viewKey: string, kind: ViewItems): Promise<Set<string>>;
  /** Whether the album is in any active list. If not, it is in Unsorted (TS-13). */
  inActiveList(albumId: string): Promise<boolean>;
};

/** A change for the account's log; the database layer gives it its `seq`. */
export type ChangeInput =
  | { entity: "album"; id: string; op: ChangeOp; data: Album | null }
  | { entity: "container"; id: string; op: ChangeOp; data: Container | null }
  | { entity: "membership"; id: string; op: ChangeOp; data: Membership | null }
  | { entity: "link"; id: string; op: ChangeOp; data: ServiceLink | null }
  | { entity: "field"; id: string; op: ChangeOp; data: CustomField | null }
  | { entity: "fieldValue"; id: string; op: ChangeOp; data: FieldValue | null }
  | { entity: "view"; id: string; op: ChangeOp; data: ViewPrefs | null }
  | { entity: "defaults"; id: string; op: ChangeOp; data: ViewDefaults }
  | { entity: "position"; id: string; op: ChangeOp; data: Position | null };

/** `result` is what the mutation reports in its `confirmed` outcome, if anything, such as `MembershipAddResult`. */
export type CommandResult =
  | { status: "applied"; changes: ChangeInput[]; result?: unknown }
  | Extract<Outcome, { status: "failed" | "conflict" | "needs_input" }>;

/**
 * `now` is the time a command records, such as when an album joined a list; the current time if absent. `capture`
 * is what the API found for an `album.capture` before the lock, and `link` how it read a `link.set`'s URL.
 */
export type CommandContext = {
  principal: Principal;
  store: CollectionStore;
  now?: Date;
  capture?: CaptureSource;
  link?: PreparedLink;
};

export function runCommand(mutation: Mutation, context: CommandContext): Promise<CommandResult> {
  if (mutation.name === "album.create") return createAlbum(mutation.args, context);
  if (mutation.name === "album.update") return updateAlbum(mutation.args, mutation.base, context);
  if (mutation.name === "album.setArtwork") {
    return setArtwork(mutation.args, mutation.base, context);
  }
  if (mutation.name === "album.capture") {
    return captureAlbum(mutation.args, context.capture, context);
  }
  if (mutation.name === "field.create") return createField(mutation.args, context);
  if (mutation.name === "field.rename") return renameField(mutation.args, mutation.base, context);
  if (mutation.name === "field.changeType") {
    return changeFieldType(mutation.args, mutation.base, context);
  }
  if (mutation.name === "field.addOption") return addFieldOption(mutation.args, context);
  if (mutation.name === "field.renameOption") {
    return renameFieldOption(mutation.args, mutation.base, context);
  }
  if (mutation.name === "field.removeOption") return removeFieldOption(mutation.args, context);
  if (mutation.name === "fieldValue.apply") return applyField(mutation.args, context);
  if (mutation.name === "fieldValue.set") {
    return setFieldValue(mutation.args, mutation.base, context);
  }
  if (mutation.name === "fieldValue.remove") return removeField(mutation.args, context);
  if (mutation.name === "container.create") return createContainer(mutation.args, context);
  if (mutation.name === "container.rename") {
    return renameContainer(mutation.args, mutation.base, context);
  }
  if (mutation.name === "container.move") {
    return moveContainer(mutation.args, mutation.base, context);
  }
  if (mutation.name === "membership.add") return addMembership(mutation.args, context);
  if (mutation.name === "membership.remove") return removeMembership(mutation.args, context);
  if (mutation.name === "link.set") return setLink(mutation.args, mutation.base, context);
  if (mutation.name === "link.remove") return removeLink(mutation.args, mutation.base, context);
  if (mutation.name === "view.set") return setView(mutation.args, mutation.base, context);
  if (mutation.name === "order.set") return setOrder(mutation.args, mutation.base, context);
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
  args: AlbumCreateArgs,
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

  // Its artwork, if any, follows with `album.setArtwork` (TON-48).
  const album: Album = { ...args, artworkUrl: null };
  await store.insertAlbum({ ...album, ownerId });
  // A new album is in no list yet, so it enters Unsorted, at the top (DS-51). Until Unsorted is arranged, its
  // fallback order, newest first, already puts it there.
  const arranged = (await store.firstKey(ownerId, "unsorted")) !== undefined;
  return applied(
    { entity: "album", id: args.id, op: "insert", data: album },
    ...(arranged ? [await placeAtTop(store, ownerId, "unsorted", args.id)] : []),
  );
}

/**
 * `album.setArtwork` (FR-03.4): sets or clears the album's artwork URL if it is still `base.artworkUrl` (TS-21). It
 * must be an https link; the image proxy checks the rest each time it fetches (TS-103). The same URL changes nothing.
 */
async function setArtwork(
  { id, artworkUrl }: { id: string; artworkUrl: string | null },
  base: { artworkUrl: string | null },
  { principal, store }: CommandContext,
): Promise<CommandResult> {
  const album = await store.findAlbum(id);
  if (!album) return failure("not_found", "This album doesn't exist.");
  const decision = authorizeWrite(principal, { ownerId: album.ownerId, scope: "collection" });
  if (!decision.allowed) return failure(decision.code, "You can't change this album.");
  if (album.artworkUrl !== base.artworkUrl) {
    return {
      status: "conflict",
      conflicts: [
        {
          field: "artworkUrl",
          current: album.artworkUrl,
          attempted: artworkUrl,
          base: base.artworkUrl,
        },
      ],
    };
  }
  if (artworkUrl !== null && !isArtworkUrl(artworkUrl)) {
    return failure("validation_failed", artworkUrlRefusal, [
      { path: "args.artworkUrl", message: "Not an https link" },
    ]);
  }
  if (artworkUrl === album.artworkUrl) return applied();
  await store.updateAlbum(id, { artworkUrl });
  return applied({ entity: "album", id, op: "update", data: albumOf({ ...album, artworkUrl }) });
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
