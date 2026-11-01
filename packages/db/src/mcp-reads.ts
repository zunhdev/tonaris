// What MCP's read tools read (TS-63, TS-65) for the person a connection acts for: their usage and folder tree, a page
// of a folder or list in their manual order (their own, or one shared with them), Unsorted, one album in full, Trash,
// and their custom fields with usage. Albums carry the sources of their values, which the tools filter by policy
// before an agent sees them (TS-15). Pages are offsets into an order that is stable between calls.

import { and, asc, count, desc, eq, inArray, isNull, not, sql } from "drizzle-orm";

import type {
  Album,
  ContainerKind,
  CustomField,
  FieldValueData,
  ProvenanceSource,
  StreamingService,
  TrashUnit,
} from "@tonaris/domain";

import { canReadContainer, readableContainers } from "./access";
import { readSnapshot, type Database, type Executor, type Transaction } from "./client";
import { albumColumns, inActiveList, serviceLinkColumns, unitsOfAccount } from "./columns";
import { readFieldUsage } from "./field-options";
import { fieldsOfAccount, valuesOfAlbums } from "./field-values";
import {
  albumProvenance,
  albums,
  albumServiceLinks,
  containers,
  fieldDefinitions,
  memberships,
  positions,
  users,
} from "./schema";
import { collectionStore } from "./store";

/** The source of each of an album's values that has one, by the API's field name (TS-15). */
export type AlbumSources = Partial<Record<string, ProvenanceSource>>;

export type SourcedAlbum = Album & { sources: AlbumSources };

/** A page of `items` out of `total`, from an offset in a stable order. */
export type Page<T> = { items: T[]; total: number };

/** The sources of these albums' values. */
export async function albumSources(
  db: Executor,
  albumIds: readonly string[],
): Promise<Map<string, AlbumSources>> {
  const bySource = new Map<string, AlbumSources>(albumIds.map((id) => [id, {}]));
  if (albumIds.length === 0) return bySource;
  const rows = await db
    .select({
      albumId: albumProvenance.albumId,
      field: albumProvenance.field,
      source: albumProvenance.source,
    })
    .from(albumProvenance)
    .where(inArray(albumProvenance.albumId, [...albumIds]));
  for (const { albumId, field, source } of rows) {
    const sources = bySource.get(albumId);
    if (sources) sources[field] = source;
  }
  return bySource;
}

async function withSources(db: Executor, rows: readonly Album[]): Promise<SourcedAlbum[]> {
  const sources = await albumSources(
    db,
    rows.map((album) => album.id),
  );
  return rows.map((album) => ({ ...album, sources: sources.get(album.id) ?? {} }));
}

/** What the owner's records use, Trash included, as the limits count them (TS-18). */
export type CollectionUsage = {
  albums: number;
  containers: number;
  memberships: number;
  fields: number;
};

/** The counts the commands check the limits against, from one snapshot. */
export function collectionUsage(db: Database, ownerId: string): Promise<CollectionUsage> {
  return readSnapshot(db, async (tx) => {
    const store = collectionStore(tx);
    const [albumCount, containerCount, membershipCount, [fieldCount]] = await Promise.all([
      store.countAlbums(ownerId),
      store.countContainers(ownerId),
      store.countMemberships(ownerId),
      tx.select({ n: count() }).from(fieldDefinitions).where(eq(fieldDefinitions.ownerId, ownerId)),
    ]);
    return {
      albums: albumCount,
      containers: containerCount,
      memberships: membershipCount,
      fields: fieldCount?.n ?? 0,
    };
  });
}

export type TreeEntry = { id: string; kind: ContainerKind; name: string; parentId: string | null };

/**
 * The owner's active folders and lists, breadth-first from the root, each level's folders before lists and by name:
 * at most `limit`, so a cut-off tree still holds the top levels.
 */
export async function collectionTree(
  db: Database,
  ownerId: string,
  limit: number,
): Promise<Page<TreeEntry>> {
  const rows = await db
    .select({
      id: containers.id,
      kind: containers.kind,
      name: containers.name,
      parentId: containers.parentId,
    })
    .from(containers)
    .where(and(eq(containers.ownerId, ownerId), isNull(containers.trashedAt)))
    .orderBy(asc(containers.kind), sql`${containers.nameKey} collate "C"`, asc(containers.id));
  const children = Map.groupBy(rows, (row) => row.parentId);
  const items: TreeEntry[] = [];
  for (let level = children.get(null) ?? []; level.length > 0 && items.length < limit;) {
    items.push(...level.slice(0, limit - items.length));
    level = level.flatMap((entry) => children.get(entry.id) ?? []);
  }
  return { items, total: rows.length };
}

export type ContainerInfo = TreeEntry & { description: string | null };

/** Whose a folder, list or album is, when it isn't the reader's: someone shares it with them. */
export type SharedOwner = { displayName: string | null };

export type ContainerPage =
  | { kind: "missing" }
  | {
      kind: "children";
      /** Null for the root of the reader's collection. */
      container: ContainerInfo | null;
      owner: SharedOwner | null;
      page: Page<TreeEntry>;
    }
  | {
      kind: "albums";
      container: ContainerInfo;
      owner: SharedOwner | null;
      page: Page<SourcedAlbum>;
    };

/** The reader's manual order in `viewKey`: their positions joined to the items, by key compared bytewise (TS-16). */
function manualOrder(
  readerId: string,
  viewKey: string,
  itemId: typeof albums.id | typeof containers.id,
) {
  return {
    join: and(
      eq(positions.personId, readerId),
      eq(positions.viewKey, viewKey),
      eq(positions.itemId, itemId),
    ),
    first: sql`${positions.key} collate "C" asc nulls last`,
  };
}

/** A view of a container, or of the reader's root: what it shows, whose content it is, and who shares it. */
type View = { container: ContainerInfo | null; ownerId: string; owner: SharedOwner | null };

/**
 * The view of `containerId` for `readerId`, or of their root without one: an active container of their own or one
 * shared with them (FR-10.2, FR-07); undefined for anything else.
 */
async function viewOf(
  tx: Transaction,
  readerId: string,
  containerId?: string,
): Promise<View | undefined> {
  if (!containerId) return { container: null, ownerId: readerId, owner: null };
  const [found] = await tx
    .select({
      id: containers.id,
      kind: containers.kind,
      name: containers.name,
      parentId: containers.parentId,
      description: containers.description,
      ownerId: containers.ownerId,
      ownerName: users.displayName,
    })
    .from(containers)
    .innerJoin(users, eq(users.id, containers.ownerId))
    .where(and(eq(containers.id, containerId), isNull(containers.trashedAt)));
  if (!found) return undefined;
  const { ownerId, ownerName, ...container } = found;
  if (ownerId === readerId) return { container, ownerId, owner: null };
  const viewer = { kind: "person", userId: readerId } as const;
  if (!(await canReadContainer(tx, viewer, found.id))) return undefined;
  // A shared root's folder may be one the reader can't see.
  if (container.parentId && !(await canReadContainer(tx, viewer, container.parentId))) {
    container.parentId = null;
  }
  return { container, ownerId, owner: { displayName: ownerName } };
}

/** A list's active albums, joined from its entries, in the reader's manual order, then the order they joined (TS-16). */
function listOrder(readerId: string, listId: string, ownerId: string) {
  const order = manualOrder(readerId, listId, albums.id);
  return {
    join: order.join,
    where: and(
      eq(memberships.listId, listId),
      eq(albums.ownerId, ownerId),
      isNull(albums.trashedAt),
    ),
    by: [order.first, asc(memberships.addedAt), asc(albums.id)],
  };
}

/** The root's or a folder's active folders and lists, in the reader's manual order, then creation (TS-16). */
function childrenOrder(readerId: string, { container, ownerId }: View) {
  const order = manualOrder(readerId, container?.id ?? "root", containers.id);
  return {
    join: order.join,
    where: and(
      eq(containers.ownerId, ownerId),
      isNull(containers.trashedAt),
      container ? eq(containers.parentId, container.id) : isNull(containers.parentId),
    ),
    by: [order.first, asc(containers.createdAt), asc(containers.id)],
  };
}

/** The owner's Unsorted: active albums in no active list (FR-01.9), in their manual order, then newest first (TS-16). */
function unsortedOrder(tx: Transaction, ownerId: string) {
  const order = manualOrder(ownerId, "unsorted", albums.id);
  return {
    join: order.join,
    where: and(
      eq(albums.ownerId, ownerId),
      isNull(albums.trashedAt),
      not(inActiveList(tx, albums.id)),
    ),
    by: [order.first, desc(albums.createdAt), desc(albums.id)],
  };
}

/**
 * A page of the root's or a folder's active folders and lists, or a list's active albums (TS-63), in the reader's
 * manual order, then the fallback order: creation for folders and lists, joining for a list's albums (TS-16). The
 * container is the reader's own or one shared with them (FR-10.2, FR-07); anything else is `missing`.
 */
export function containerPage(
  db: Database,
  {
    readerId,
    containerId,
    offset,
    limit,
  }: { readerId: string; containerId?: string; offset: number; limit: number },
): Promise<ContainerPage> {
  return readSnapshot(db, async (tx): Promise<ContainerPage> => {
    const view = await viewOf(tx, readerId, containerId);
    if (!view) return { kind: "missing" };
    const { container, owner } = view;
    if (container?.kind === "list") {
      const order = listOrder(readerId, container.id, view.ownerId);
      const [rows, [total]] = await Promise.all([
        tx
          .select(albumColumns)
          .from(memberships)
          .innerJoin(albums, eq(albums.id, memberships.albumId))
          .leftJoin(positions, order.join)
          .where(order.where)
          .orderBy(...order.by)
          .offset(offset)
          .limit(limit),
        tx
          .select({ n: count() })
          .from(memberships)
          .innerJoin(albums, eq(albums.id, memberships.albumId))
          .where(order.where),
      ]);
      return {
        kind: "albums",
        container,
        owner,
        page: { items: await withSources(tx, rows), total: total?.n ?? 0 },
      };
    }

    const order = childrenOrder(readerId, view);
    const [rows, [total]] = await Promise.all([
      tx
        .select({
          id: containers.id,
          kind: containers.kind,
          name: containers.name,
          parentId: containers.parentId,
        })
        .from(containers)
        .leftJoin(positions, order.join)
        .where(order.where)
        .orderBy(...order.by)
        .offset(offset)
        .limit(limit),
      tx.select({ n: count() }).from(containers).where(order.where),
    ]);
    return { kind: "children", container, owner, page: { items: rows, total: total?.n ?? 0 } };
  });
}

/** A page of the owner's Unsorted (FR-01.9), in their manual order, then newest first (TS-16). */
export function unsortedPage(
  db: Database,
  { ownerId, offset, limit }: { ownerId: string; offset: number; limit: number },
): Promise<Page<SourcedAlbum>> {
  return readSnapshot(db, async (tx) => {
    const order = unsortedOrder(tx, ownerId);
    const [rows, [total]] = await Promise.all([
      tx
        .select(albumColumns)
        .from(albums)
        .leftJoin(positions, order.join)
        .where(order.where)
        .orderBy(...order.by)
        .offset(offset)
        .limit(limit),
      tx.select({ n: count() }).from(albums).where(order.where),
    ]);
    return { items: await withSources(tx, rows), total: total?.n ?? 0 };
  });
}

/**
 * The first `limit` IDs a view holds now, in the order its pages list them (TS-16): the root's or a folder's folders
 * and lists, a list's albums, or Unsorted. Undefined for a folder or list `readerId` can't read.
 */
export async function viewItemIds(
  tx: Transaction,
  { readerId, viewKey, limit }: { readerId: string; viewKey: string; limit: number },
): Promise<string[] | undefined> {
  let rows: { id: string }[];
  if (viewKey === "unsorted") {
    const order = unsortedOrder(tx, readerId);
    rows = await tx
      .select({ id: albums.id })
      .from(albums)
      .leftJoin(positions, order.join)
      .where(order.where)
      .orderBy(...order.by)
      .limit(limit);
    return rows.map((row) => row.id);
  }
  const view = await viewOf(tx, readerId, viewKey === "root" ? undefined : viewKey);
  if (!view) return undefined;
  if (view.container?.kind === "list") {
    const order = listOrder(readerId, view.container.id, view.ownerId);
    rows = await tx
      .select({ id: albums.id })
      .from(memberships)
      .innerJoin(albums, eq(albums.id, memberships.albumId))
      .leftJoin(positions, order.join)
      .where(order.where)
      .orderBy(...order.by)
      .limit(limit);
  } else {
    const order = childrenOrder(readerId, view);
    rows = await tx
      .select({ id: containers.id })
      .from(containers)
      .leftJoin(positions, order.join)
      .where(order.where)
      .orderBy(...order.by)
      .limit(limit);
  }
  return rows.map((row) => row.id);
}

/** A custom field's value on an album, with the options it chooses for a choice field. */
export type AlbumFieldValue = {
  fieldId: string;
  name: string;
  type: CustomField["type"];
  value: FieldValueData;
  /** The chosen options, in their order, for a choice field; empty otherwise. */
  chosen: { id: string; label: string }[];
};

export type AlbumDetail = {
  album: SourcedAlbum;
  /** Null for the reader's own album. */
  owner: SharedOwner | null;
  inTrash: boolean;
  /** The active lists it is in, each with its path of names from the top; only those the reader can see if shared. */
  lists: { id: string; name: string; location: string[] }[];
  links: { service: StreamingService; url: string }[];
  fields: AlbumFieldValue[];
};

/**
 * The names from the top down to `id`, among `places`. With `visible`, the path starts at the highest folder in it,
 * as a shared list's does.
 */
function locationOf(
  places: ReadonlyMap<string, { name: string; parentId: string | null }>,
  id: string,
  visible?: ReadonlySet<string>,
): string[] {
  const path: string[] = [];
  for (let at = places.get(id); at && path.length <= places.size;) {
    path.unshift(at.name);
    if (at.parentId === null || (visible && !visible.has(at.parentId))) break;
    at = places.get(at.parentId);
  }
  return path;
}

/**
 * The album `albumId` in full (TS-63 `get_album`): the reader's own, in Trash or not, or an active one in a list
 * shared with them (FR-07). Undefined otherwise.
 */
export function albumDetail(
  db: Database,
  { readerId, albumId }: { readerId: string; albumId: string },
): Promise<AlbumDetail | undefined> {
  return readSnapshot(db, async (tx) => {
    const [found] = await tx
      .select({
        ...albumColumns,
        ownerId: albums.ownerId,
        ownerName: users.displayName,
        trashedAt: albums.trashedAt,
      })
      .from(albums)
      .innerJoin(users, eq(users.id, albums.ownerId))
      .where(eq(albums.id, albumId));
    if (!found) return undefined;
    const { ownerId, ownerName, trashedAt, ...album } = found;
    const own = ownerId === readerId;
    if (!own && trashedAt !== null) return undefined;

    const places = new Map(
      (
        await tx
          .select({ id: containers.id, name: containers.name, parentId: containers.parentId })
          .from(containers)
          .where(and(eq(containers.ownerId, ownerId), isNull(containers.trashedAt)))
      ).map((place) => [place.id, place]),
    );
    const entries = await tx
      .select({ listId: memberships.listId })
      .from(memberships)
      .where(eq(memberships.albumId, albumId));
    let listIds = entries.map((entry) => entry.listId).filter((id) => places.has(id));
    let readable: ReadonlySet<string> | undefined;
    if (!own) {
      readable = new Set(
        (await readableContainers(tx, { kind: "person", userId: readerId })).keys(),
      );
      listIds = listIds.filter((id) => readable?.has(id));
      if (listIds.length === 0) return undefined;
    }
    const lists = listIds
      .map((id) => ({
        id,
        name: places.get(id)?.name ?? "",
        location: locationOf(places, id, readable),
      }))
      .toSorted((a, b) => a.location.join("\u0000").localeCompare(b.location.join("\u0000")));

    const [links, values, definitions, sources] = await Promise.all([
      tx
        .select(serviceLinkColumns)
        .from(albumServiceLinks)
        .where(eq(albumServiceLinks.albumId, albumId))
        .orderBy(asc(albumServiceLinks.service)),
      valuesOfAlbums(tx, [albumId]),
      fieldsOfAccount(tx, ownerId),
      albumSources(tx, [albumId]),
    ]);
    const fields = values.flatMap(({ fieldId, value }): AlbumFieldValue[] => {
      const field = definitions.find((definition) => definition.id === fieldId);
      if (!field) return [];
      const ids = new Set(Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
      const chosen = field.options.filter((option) => ids.has(option.id));
      return [{ fieldId, name: field.name, type: field.type, value, chosen }];
    });
    return {
      album: { ...album, sources: sources.get(albumId) ?? {} },
      owner: own ? null : { displayName: ownerName },
      inTrash: trashedAt !== null,
      lists,
      links,
      fields: fields.toSorted((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

/** The owner's Trash, oldest first (FR-10.7): every unit, as the app's Trash view holds them. */
export function trashContents(db: Database, ownerId: string): Promise<TrashUnit[]> {
  return readSnapshot(db, (tx) => unitsOfAccount(tx, ownerId));
}

/** A custom field with how many albums apply it, active and in Trash (FR-03.12). */
export type FieldWithUsage = CustomField & { albums: number; inTrash: number };

/** The owner's custom fields, in the order they were created, with their options and usage. */
export function fieldsWithUsage(db: Database, ownerId: string): Promise<FieldWithUsage[]> {
  return readSnapshot(db, async (tx) => {
    const [fields, usage] = await Promise.all([
      fieldsOfAccount(tx, ownerId),
      readFieldUsage(tx, ownerId),
    ]);
    return fields.map((field) => {
      const used = usage.fields.find((each) => each.fieldId === field.id);
      return Object.assign(field, { albums: used?.albums ?? 0, inTrash: used?.inTrash ?? 0 });
    });
  });
}
