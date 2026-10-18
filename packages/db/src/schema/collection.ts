// Folders, lists, albums, their memberships and Trash units (TS-11, TS-13).
// Owner columns reference `user`. Account deletion removes owned rows first and the user last (TS-74), so the
// foreign keys keep the default NO ACTION rather than cascading.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { instant, notBlank, oneOf, table, timestamps, trashStamp } from "./columns";

export const trashUnitKinds = ["folder", "list", "album"] as const;

/** A purged album, recorded in every unit that still references it so recovery can report the skip (TS-13). */
export type Tombstone = { id: string; title: string; artist: string };

/** Content deleted together: recovered and purged as one unit, with one expiry (FR-01.13). */
export const trashUnits = table(
  "trash_units",
  {
    id: uuid().primaryKey(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    kind: text({ enum: trashUnitKinds }).notNull(),
    rootId: uuid().notNull(),
    deletedAt: instant().notNull(),
    expiresAt: instant().notNull(),
    tombstones: jsonb().$type<Tombstone[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index().on(t.ownerId),
    index().on(t.expiresAt),
    check("trash_units_kind_check", oneOf(t.kind, trashUnitKinds)),
  ],
);

export const containerKinds = ["folder", "list"] as const;

/** Folders and lists, as an adjacency list queried with recursive CTEs (TS-31). */
export const containers = table(
  "containers",
  {
    id: uuid().primaryKey(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    kind: text({ enum: containerKinds }).notNull(),
    // Null means the root. Deliberately no foreign key: a container trashed on its own keeps its parent's id
    // after that parent is purged, so recovery can tell the parent is missing and ask (FR-01.15).
    parentId: uuid(),
    name: text().notNull(),
    nameKey: text().notNull(),
    description: text(),
    trashedAt: instant(),
    trashUnitId: uuid().references(() => trashUnits.id),
    ...timestamps,
  },
  (t) => [
    index().on(t.ownerId),
    index().on(t.parentId),
    index().on(t.trashUnitId),
    // Active sibling names are unique, root included (FR-01.2, X-06). drizzle-kit can't put NULLS NOT DISTINCT
    // on a partial index, so the root's null parent is folded to the nil UUID instead.
    uniqueIndex("containers_active_sibling_name_key")
      .on(
        t.ownerId,
        sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
        t.nameKey,
      )
      .where(sql`${t.trashedAt} is null`),
    check("containers_kind_check", oneOf(t.kind, containerKinds)),
    check("containers_name_check", notBlank(t.name)),
    check("containers_trash_check", trashStamp(t.trashedAt, t.trashUnitId)),
  ],
);

export const releaseTypes = ["album", "ep", "compilation"] as const;

/** Album records, shared by every list they appear in (FR-01.6). */
export const albums = table(
  "albums",
  {
    id: uuid().primaryKey(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    artistCredit: text().notNull(),
    // Null is Unclassified (TS-45).
    releaseType: text({ enum: releaseTypes }),
    isLive: boolean(),
    originalYear: integer(),
    recordingYearStart: integer(),
    recordingYearEnd: integer(),
    editionLabel: text(),
    artworkUrl: text(),
    mbReleaseId: uuid(),
    mbReleaseGroupId: uuid(),
    barcode: text(),
    trashedAt: instant(),
    trashUnitId: uuid().references(() => trashUnits.id),
    // searchKey() of title and artist credit, stored so app, MCP and export search alike (TS-12).
    searchTitleKey: text().notNull(),
    searchArtistKey: text().notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.ownerId),
    index().on(t.trashUnitId),
    check("albums_title_check", notBlank(t.title)),
    check("albums_artist_credit_check", notBlank(t.artistCredit)),
    check("albums_release_type_check", oneOf(t.releaseType, releaseTypes)),
    // The applicable year is required (FR-02.6): the original year, or for a live album its recording year.
    // `is true`, because a null `is_live` would make the whole expression null, which a CHECK accepts.
    check(
      "albums_year_check",
      sql`${t.originalYear} is not null or (${t.isLive} is true and ${t.recordingYearStart} is not null)`,
    ),
    check("albums_recording_years_check", sql`${t.recordingYearEnd} >= ${t.recordingYearStart}`),
    check("albums_trash_check", trashStamp(t.trashedAt, t.trashUnitId)),
  ],
);

export const provenanceSources = [
  "user",
  "musicbrainz",
  "coverartarchive",
  "itunes-lookup",
] as const;

/** Where each metadata field came from; policy flags derive from `source` (TS-15). */
export const albumProvenance = table(
  "album_provenance",
  {
    albumId: uuid()
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    field: text().notNull(),
    source: text({ enum: provenanceSources }).notNull(),
    sourceRef: text(),
    retrievedAt: instant(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.field] }),
    check("album_provenance_source_check", oneOf(t.source, provenanceSources)),
  ],
);

export const streamingServices = ["spotify", "apple-music", "qobuz"] as const;

/** At most one current link per service and album (FR-06.2). */
export const albumServiceLinks = table(
  "album_service_links",
  {
    albumId: uuid()
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    // Copied from the album so capture can match a link within one owner's collection (TS-11).
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    service: text({ enum: streamingServices }).notNull(),
    url: text().notNull(),
    entityId: text().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.service] }),
    index().on(t.ownerId, t.service, t.entityId),
    check("album_service_links_service_check", oneOf(t.service, streamingServices)),
  ],
);

/**
 * An album's appearance in a list. Effective only while both are active; rows survive trashing either side
 * and go only when one of them is purged (TS-13).
 */
export const memberships = table(
  "memberships",
  {
    listId: uuid()
      .notNull()
      .references(() => containers.id, { onDelete: "cascade" }),
    albumId: uuid()
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    ownerId: uuid()
      .notNull()
      .references(() => users.id),
    addedAt: instant().notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.albumId] }),
    index().on(t.albumId),
    index().on(t.ownerId),
  ],
);
