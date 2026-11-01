// The store port commands read and write through (TS-02, TS-20 step 4): packages/db/src/sync.ts implements it on
// the owner's write transaction, and testing.ts in memory for the command tests.

import type { Album, AlbumFields, StoredAlbum } from "./albums";
import type { AlbumOrigin, CapturedLink, CaptureTarget } from "./capture";
import type { Container, StoredContainer } from "./containers";
import type { EnrichmentPlan } from "./enrichment";
import type { FieldUsage, OptionUser } from "./field-options";
import type { FieldValue, FieldValueData } from "./field-values";
import type { CustomField, FieldOption, FieldType, StoredField } from "./fields";
import type { StreamingService } from "./links";
import type { Membership } from "./memberships";
import type { Position } from "./positions";
import type { ViewKind } from "./presentation";
import type { EmailStatus, ShareGrantStatus } from "./sharing";
import type { StoredTrashUnit, Tombstone } from "./trash";
import type { AccountDefaults, ViewPrefs } from "./views";

/** What commands read and write. The database layer implements it on the owner's write transaction. */
export type CollectionStore = {
  /** The album with this ID, whoever owns it, in Trash or not. */
  findAlbum(id: string): Promise<StoredAlbum | undefined>;
  /**
   * Inserts the album. `origin` says where its values came from, and its release group and artwork, for a captured
   * album (TS-15); without it, the values are the person's.
   */
  insertAlbum(album: Album & { ownerId: string }, origin?: AlbumOrigin): Promise<void>;
  /** The owner's albums, those in Trash included (FR-15.2). */
  countAlbums(ownerId: string): Promise<number>;
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
   * active lists, while those in trashed lists stay for their recovery. Answers the lists it left, and its unit.
   */
  reactivateAlbum(id: string): Promise<{ left: string[]; unitId: string | null }>;
  /** The album's entries, in any list, active or in Trash. */
  entriesOfAlbum(albumId: string): Promise<Membership[]>;
  /** Records the album's own unit and moves it to Trash (FR-14.1). */
  trashAlbum(unit: StoredTrashUnit, albumId: string): Promise<void>;
  /** Takes the album out of Trash, and deletes its unit (FR-14.2). */
  recoverAlbum(unitId: string, albumId: string): Promise<void>;
  /** The unit the album in Trash is in, if any. */
  albumUnit(albumId: string): Promise<string | undefined>;
  /** The folder or list units whose lists hold an entry of the album (TS-13). */
  unitsReferencingAlbum(albumId: string): Promise<string[]>;
  /** Records what was purged in the unit, for its recovery to report (TS-13). */
  addTombstone(unitId: string, tombstone: Tombstone): Promise<void>;
  /** Deletes the folders and lists `ids` with their entries, and their unit (FR-01.17). */
  purgeContainers(unitId: string, ids: string[]): Promise<void>;
  /**
   * Deletes the album with its entries, links, values and places, and its unit (FR-14.5); answers the services and
   * fields it had, which clients hold.
   */
  purgeAlbum(
    unitId: string,
    albumId: string,
  ): Promise<{ services: StreamingService[]; fieldIds: string[] }>;
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
  /** The albums applying the field, in Trash or not, even empty (FR-03.18). */
  fieldUsers(fieldId: string): Promise<OptionUser[]>;
  /** Deletes the field with its options and every album's usage and value (FR-03.18). */
  deleteField(fieldId: string): Promise<void>;
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
  updateContainer(
    id: string,
    values: Partial<Pick<Container, "name" | "parentId" | "description">>,
  ): Promise<void>;

  /** The folder or list and its active descendants, itself first (TS-13). */
  activeSubtree(id: string): Promise<Container[]>;
  /** The entries of these lists, whether or not their albums are in Trash. */
  listEntries(listIds: string[]): Promise<Membership[]>;
  /** The Trash unit with this ID, whoever owns it. */
  findTrashUnit(id: string): Promise<StoredTrashUnit | undefined>;
  /** The folders and lists in the unit, as they were deleted. */
  unitContainers(unitId: string): Promise<Container[]>;
  /** Records the unit and moves the folders and lists `ids` into it (FR-01.13). */
  trashContainers(unit: StoredTrashUnit, ids: string[]): Promise<void>;
  /** Takes the folders and lists `ids` out of Trash, and deletes their unit. */
  recoverContainers(unitId: string, ids: string[]): Promise<void>;

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
  findDefaults(personId: string): Promise<AccountDefaults | undefined>;
  /** Inserts or replaces the person's account defaults. */
  saveDefaults(personId: string, defaults: AccountDefaults): Promise<void>;

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
  viewItems(personId: string, viewKey: string, kind: ViewKind): Promise<Set<string>>;
  /** Whether the person may read someone else's folder or list through sharing (TS-33, FR-07.17). */
  canReadShared(personId: string, containerId: string): Promise<boolean>;
  /** Whether the album is in any active list. If not, it is in Unsorted (TS-13). */
  inActiveList(albumId: string): Promise<boolean>;

  /** The account an email key signs in with, if any (FR-07.4). */
  findAccountByEmail(emailKey: string): Promise<{ id: string } | undefined>;
  /** The account's display name; null for none (FR-11.3). */
  displayNameOf(userId: string): Promise<string | null>;
  setDisplayName(userId: string, displayName: string | null): Promise<void>;
  /** The owner's pending or accepted grants and live links, on any of their folders and lists (TS-34). */
  activeShareCount(ownerId: string): Promise<number>;
  /** The person's pending or accepted grant on the container, if any: one at most (TS-11). */
  findOpenGrant(containerId: string, granteeId: string): Promise<ShareGrant | undefined>;
  insertGrant(
    grant: ShareGrant & {
      containerId: string;
      granteeId: string;
      invitedEmail: string;
      emailStatus: EmailStatus | null;
    },
  ): Promise<void>;
  /** The grant, if it exists. */
  findGrant(
    id: string,
  ): Promise<(ShareGrant & { containerId: string; granteeId: string }) | undefined>;
  /** Sets the grant's status if it is still `from`; answers whether it was (TS-33). */
  moveGrant(id: string, from: ShareGrantStatus, to: ShareGrantStatus): Promise<boolean>;
  setGrantEmailStatus(id: string, status: EmailStatus): Promise<void>;
  /**
   * Saves the container to the viewer's references (TS-33, FR-07.13). With `linkId`, the reference points at that
   * link; without, one they have keeps its link. Answers what happened.
   */
  saveReference(
    viewerId: string,
    containerId: string,
    linkId?: string,
  ): Promise<"inserted" | "updated" | "unchanged">;
  /** Drops the viewer's reference to the container if it came from a grant alone, with no link (TS-33). */
  dropGrantReference(viewerId: string, containerId: string): Promise<boolean>;
  /** Drops the viewer's reference to the container; answers whether there was one. */
  removeReference(viewerId: string, containerId: string): Promise<boolean>;
  /** The link a token's hash names, while it is live and its container active (TS-32). */
  findLinkByHash(
    hash: Uint8Array,
  ): Promise<{ id: string; containerId: string; ownerId: string } | undefined>;
  /** The container's link that isn't revoked, if any: one at most (FR-07.16). */
  findLiveLink(containerId: string): Promise<{ id: string } | undefined>;
  insertLink(link: { id: string; containerId: string; tokenHash: Uint8Array }): Promise<void>;
  revokeLink(id: string, at: Date): Promise<void>;
};

/** A grant as the commands see it. */
export type ShareGrant = { id: string; status: ShareGrantStatus };
