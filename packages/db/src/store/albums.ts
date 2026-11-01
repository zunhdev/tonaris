// The store's albums and Trash (TS-11, TS-13, TS-15; FR-01.11–FR-01.17, FR-14): album records with their search keys
// and provenance, their entries and service links, and Trash units, purged with what they hold.

import { and, asc, count, eq, exists, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { searchKey, type CollectionStore } from "@tonaris/domain";

import { albumsOfReleaseGroupIn, applyPlan, findCaptureTarget } from "../album-writes";
import type { Transaction } from "../client";
import { albumColumns, containerColumns, membershipColumns, membershipOf } from "../columns";
import { recordInLedger } from "../ledger";
import { recordUserValues, userEntries, writeProvenance } from "../provenance";
import {
  albumFieldValues,
  albums,
  albumServiceLinks,
  containers,
  memberships,
  positions,
  trashUnits,
} from "../schema";

/** Albums, their entries and links, and Trash units, on `tx`. */
export function albumStore(tx: Transaction) {
  return {
    async findAlbum(id) {
      const [row] = await tx
        .select({ ...albumColumns, ownerId: albums.ownerId, trashedAt: albums.trashedAt })
        .from(albums)
        .where(eq(albums.id, id));
      if (!row) return undefined;
      const { trashedAt, ...album } = row;
      return { ...album, trashed: trashedAt !== null };
    },
    async insertAlbum({ ownerId, id, ...values }, origin) {
      await tx.insert(albums).values({
        id,
        ownerId,
        ...values,
        ...(origin ? { mbReleaseGroupId: origin.releaseGroupId } : {}),
        searchTitleKey: searchKey(values.title),
        searchArtistKey: searchKey(values.artistCredit),
      });
      // A new album has no rows to clear.
      await writeProvenance(tx, id, origin ? origin.provenance : userEntries(values));
    },
    async updateAlbum(id, values) {
      await tx
        .update(albums)
        .set({
          ...values,
          ...(values.title === undefined ? {} : { searchTitleKey: searchKey(values.title) }),
          ...(values.artistCredit === undefined
            ? {}
            : { searchArtistKey: searchKey(values.artistCredit) }),
        })
        .where(eq(albums.id, id));
      await recordUserValues(tx, id, values);
    },
    findCaptureTarget: (id) => findCaptureTarget(tx, id),
    albumsOfReleaseGroup: (ownerId, releaseGroupId) =>
      albumsOfReleaseGroupIn(tx, ownerId, releaseGroupId),
    fillAlbum: (id, plan) => applyPlan(tx, id, plan),
    async reactivateAlbum(id) {
      const [album] = await tx
        .select({ trashUnitId: albums.trashUnitId })
        .from(albums)
        .where(eq(albums.id, id));
      await tx.update(albums).set({ trashedAt: null, trashUnitId: null }).where(eq(albums.id, id));
      // An album's own unit holds only it (TS-13), so it goes with the album's return.
      if (album?.trashUnitId) {
        await tx
          .delete(trashUnits)
          .where(
            and(
              eq(trashUnits.id, album.trashUnitId),
              eq(trashUnits.kind, "album"),
              eq(trashUnits.rootId, id),
            ),
          );
      }
      const left = await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.albumId, id),
            exists(
              tx
                .select({ one: sql`1` })
                .from(containers)
                .where(and(eq(containers.id, memberships.listId), isNull(containers.trashedAt))),
            ),
          ),
        )
        .returning({ listId: memberships.listId });
      return { left: left.map((row) => row.listId), unitId: album?.trashUnitId ?? null };
    },
    async countAlbums(ownerId) {
      const [row] = await tx
        .select({ count: count() })
        .from(albums)
        .where(eq(albums.ownerId, ownerId));
      return row?.count ?? 0;
    },
    async entriesOfAlbum(albumId) {
      const rows = await tx
        .select(membershipColumns)
        .from(memberships)
        .where(eq(memberships.albumId, albumId))
        .orderBy(asc(memberships.listId));
      return rows.map(membershipOf);
    },
    async trashAlbum(unit, albumId) {
      await tx.insert(trashUnits).values(unit);
      await tx
        .update(albums)
        .set({ trashedAt: unit.deletedAt, trashUnitId: unit.id })
        .where(eq(albums.id, albumId));
    },
    async albumUnit(albumId) {
      const [row] = await tx
        .select({ unitId: albums.trashUnitId })
        .from(albums)
        .where(eq(albums.id, albumId));
      return row?.unitId ?? undefined;
    },
    async unitsReferencingAlbum(albumId) {
      const rows = await tx
        .selectDistinct({ unitId: containers.trashUnitId })
        .from(memberships)
        .innerJoin(containers, eq(containers.id, memberships.listId))
        .where(and(eq(memberships.albumId, albumId), isNotNull(containers.trashUnitId)));
      return rows.flatMap((row) => (row.unitId ? [row.unitId] : []));
    },
    async addTombstone(unitId, tombstone) {
      await tx
        .update(trashUnits)
        .set({ tombstones: sql`${trashUnits.tombstones} || ${JSON.stringify([tombstone])}::jsonb` })
        .where(eq(trashUnits.id, unitId));
    },
    async purgeContainers(unitId, ids) {
      // Their entries cascade (TS-11); albums stay where else they are (FR-01.17).
      if (ids.length > 0) await tx.delete(containers).where(inArray(containers.id, ids));
      await tx.delete(trashUnits).where(eq(trashUnits.id, unitId));
      await recordInLedger(tx, {
        type: "trash.purged",
        unitId,
        containerIds: [...ids],
        albumIds: [],
      });
    },
    async purgeAlbum(unitId, albumId) {
      const links = await tx
        .select({ service: albumServiceLinks.service })
        .from(albumServiceLinks)
        .where(eq(albumServiceLinks.albumId, albumId));
      const values = await tx
        .select({ fieldId: albumFieldValues.fieldId })
        .from(albumFieldValues)
        .where(eq(albumFieldValues.albumId, albumId));
      // Its entries, links, values and provenance cascade (TS-11); its places don't refer to it by key.
      await tx.delete(positions).where(eq(positions.itemId, albumId));
      await tx.delete(albums).where(eq(albums.id, albumId));
      await tx.delete(trashUnits).where(eq(trashUnits.id, unitId));
      await recordInLedger(tx, {
        type: "trash.purged",
        unitId,
        containerIds: [],
        albumIds: [albumId],
      });
      return {
        services: links.map((link) => link.service),
        fieldIds: values.map((value) => value.fieldId),
      };
    },
    async recoverAlbum(unitId, albumId) {
      await tx
        .update(albums)
        .set({ trashedAt: null, trashUnitId: null })
        .where(and(eq(albums.id, albumId), eq(albums.trashUnitId, unitId)));
      await tx.delete(trashUnits).where(eq(trashUnits.id, unitId));
    },
    async findServiceLink(albumId, service) {
      const [row] = await tx
        .select({
          service: albumServiceLinks.service,
          url: albumServiceLinks.url,
          entityId: albumServiceLinks.entityId,
        })
        .from(albumServiceLinks)
        .where(and(eq(albumServiceLinks.albumId, albumId), eq(albumServiceLinks.service, service)));
      return row;
    },
    async insertServiceLink(albumId, ownerId, link) {
      await tx.insert(albumServiceLinks).values({ albumId, ownerId, ...link });
    },
    async saveServiceLink(albumId, ownerId, link) {
      await tx
        .insert(albumServiceLinks)
        .values({ albumId, ownerId, ...link })
        .onConflictDoUpdate({
          target: [albumServiceLinks.albumId, albumServiceLinks.service],
          set: { url: link.url, entityId: link.entityId, updatedAt: sql`now()` },
        });
    },
    async deleteServiceLink(albumId, service) {
      await tx
        .delete(albumServiceLinks)
        .where(and(eq(albumServiceLinks.albumId, albumId), eq(albumServiceLinks.service, service)));
    },
    async findTrashUnit(id) {
      const [unit] = await tx
        .select({
          id: trashUnits.id,
          ownerId: trashUnits.ownerId,
          kind: trashUnits.kind,
          rootId: trashUnits.rootId,
          deletedAt: trashUnits.deletedAt,
          expiresAt: trashUnits.expiresAt,
          tombstones: trashUnits.tombstones,
        })
        .from(trashUnits)
        .where(eq(trashUnits.id, id));
      return unit;
    },
    async unitContainers(unitId) {
      return tx
        .select(containerColumns)
        .from(containers)
        .where(eq(containers.trashUnitId, unitId))
        .orderBy(asc(containers.id));
    },
    async trashContainers(unit, ids) {
      await tx.insert(trashUnits).values(unit);
      if (ids.length === 0) return;
      await tx
        .update(containers)
        .set({ trashedAt: unit.deletedAt, trashUnitId: unit.id })
        .where(inArray(containers.id, ids));
    },
    async recoverContainers(unitId, ids) {
      if (ids.length > 0) {
        await tx
          .update(containers)
          .set({ trashedAt: null, trashUnitId: null })
          .where(and(inArray(containers.id, ids), eq(containers.trashUnitId, unitId)));
      }
      await tx.delete(trashUnits).where(eq(trashUnits.id, unitId));
    },
  } satisfies Partial<CollectionStore>;
}
