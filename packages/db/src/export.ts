// The data export's reader (FR-08.4, FR-08.5, TS-80): one owner's saved collection, Trash included, read in one
// read-only REPEATABLE READ transaction, so the export is one point in time. It reads the owner's collection tables
// and nothing else: no account, sharing, reference or credential table, so those stay out by construction.

import { asc, eq } from "drizzle-orm";

import { appViewDefaults, type ExportSource, type ViewDefaults } from "@tonaris/domain";

import type { Database } from "./client";
import {
  accountSettings,
  albumProvenance,
  albumServiceLinks,
  albums,
  containers,
  memberships,
  positions,
  trashUnits,
  viewPrefs,
} from "./schema";
import {
  albumColumns,
  containerColumns,
  defaultsColumns,
  fieldsOfAccount,
  positionColumns,
  valuesOfAccount,
  viewPrefsColumns,
} from "./sync";

/** What the export of `accountId`'s collection is built from, as of `exportedAt`. */
export function exportSource(
  db: Database,
  accountId: string,
  exportedAt: Date = new Date(),
): Promise<ExportSource> {
  return db.transaction(
    async (tx) => {
      const owned = await tx
        .select({
          ...albumColumns,
          mbReleaseId: albums.mbReleaseId,
          mbReleaseGroupId: albums.mbReleaseGroupId,
          trashedAt: albums.trashedAt,
          trashUnitId: albums.trashUnitId,
        })
        .from(albums)
        .where(eq(albums.ownerId, accountId))
        .orderBy(asc(albums.id));
      const tree = await tx
        .select({
          ...containerColumns,
          trashedAt: containers.trashedAt,
          trashUnitId: containers.trashUnitId,
        })
        .from(containers)
        .where(eq(containers.ownerId, accountId))
        .orderBy(asc(containers.id));
      const entries = await tx
        .select({ listId: memberships.listId, albumId: memberships.albumId })
        .from(memberships)
        .where(eq(memberships.ownerId, accountId))
        .orderBy(asc(memberships.addedAt), asc(memberships.albumId));
      const links = await tx
        .select({
          albumId: albumServiceLinks.albumId,
          service: albumServiceLinks.service,
          url: albumServiceLinks.url,
        })
        .from(albumServiceLinks)
        .where(eq(albumServiceLinks.ownerId, accountId))
        .orderBy(asc(albumServiceLinks.albumId), asc(albumServiceLinks.service));
      const provenance = await tx
        .select({
          albumId: albumProvenance.albumId,
          field: albumProvenance.field,
          source: albumProvenance.source,
        })
        .from(albumProvenance)
        .innerJoin(albums, eq(albums.id, albumProvenance.albumId))
        .where(eq(albums.ownerId, accountId));
      const views = await tx
        .select(viewPrefsColumns)
        .from(viewPrefs)
        .where(eq(viewPrefs.personId, accountId))
        .orderBy(asc(viewPrefs.viewKey));
      const arranged = await tx
        .select(positionColumns)
        .from(positions)
        .where(eq(positions.personId, accountId));
      const [defaults]: ViewDefaults[] = await tx
        .select(defaultsColumns)
        .from(accountSettings)
        .where(eq(accountSettings.accountId, accountId));
      const units = await tx
        .select({
          id: trashUnits.id,
          kind: trashUnits.kind,
          rootId: trashUnits.rootId,
          deletedAt: trashUnits.deletedAt,
          expiresAt: trashUnits.expiresAt,
        })
        .from(trashUnits)
        .where(eq(trashUnits.ownerId, accountId))
        .orderBy(asc(trashUnits.deletedAt), asc(trashUnits.id));
      return {
        exportedAt,
        albums: owned,
        containers: tree,
        memberships: entries,
        links,
        fields: await fieldsOfAccount(tx, accountId),
        values: await valuesOfAccount(tx, accountId),
        provenance,
        views,
        positions: arranged,
        defaults: defaults ?? appViewDefaults,
        units,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
