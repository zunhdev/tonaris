// Column maps and the reads other modules share (TS-11, TS-13): an album, folder, list, entry, view choice, position
// and the account defaults as clients hold them, an entry of an active list, and Trash units as clients hold them.

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { trashUnitOf, type Membership, type TrashUnit } from "@tonaris/domain";

import type { Transaction } from "./client";
import {
  accountSettings,
  albums,
  containers,
  memberships,
  positions,
  trashUnits,
  viewPrefs,
} from "./schema";

/** An album's columns as clients hold it (TS-11). */
export const albumColumns = {
  id: albums.id,
  title: albums.title,
  artistCredit: albums.artistCredit,
  releaseType: albums.releaseType,
  isLive: albums.isLive,
  originalYear: albums.originalYear,
  recordingYearStart: albums.recordingYearStart,
  recordingYearEnd: albums.recordingYearEnd,
  artworkUrl: albums.artworkUrl,
};

export const containerColumns = {
  id: containers.id,
  kind: containers.kind,
  parentId: containers.parentId,
  name: containers.name,
  description: containers.description,
};

export const membershipColumns = {
  listId: memberships.listId,
  albumId: memberships.albumId,
  addedAt: memberships.addedAt,
};

export const viewPrefsColumns = {
  viewKey: viewPrefs.viewKey,
  sortMode: viewPrefs.sortMode,
  sortDir: viewPrefs.sortDir,
  grouped: viewPrefs.grouped,
  layout: viewPrefs.layout,
};

export const defaultsColumns = {
  listSortMode: accountSettings.listSortMode,
  listSortDir: accountSettings.listSortDir,
  folderSortMode: accountSettings.folderSortMode,
  folderSortDir: accountSettings.folderSortDir,
  grouped: accountSettings.grouped,
  layout: accountSettings.layout,
};

/**
 * The account defaults with the link setting and the services turned off, as the person's sessions see them; the
 * export leaves them out.
 */
export const accountDefaultsColumns = {
  ...defaultsColumns,
  linkTarget: accountSettings.linkTarget,
  hiddenServices: accountSettings.hiddenServices,
};

export const positionColumns = {
  viewKey: positions.viewKey,
  itemId: positions.itemId,
  key: positions.key,
};

/** An entry of an active list: the album is in Unsorted while it has none (FR-01.9, TS-13). */
export function activeEntryOf(tx: Transaction, albumId: typeof albums.id | string) {
  return tx
    .select({ one: sql`1` })
    .from(memberships)
    .innerJoin(containers, eq(containers.id, memberships.listId))
    .where(and(eq(memberships.albumId, albumId), isNull(containers.trashedAt)));
}

/** The account's Trash units as clients hold them, oldest first: each with its root's name and its members (FR-01.12). */
export async function unitsOfAccount(tx: Transaction, accountId: string): Promise<TrashUnit[]> {
  const units = await tx
    .select({
      id: trashUnits.id,
      ownerId: trashUnits.ownerId,
      kind: trashUnits.kind,
      rootId: trashUnits.rootId,
      deletedAt: trashUnits.deletedAt,
      expiresAt: trashUnits.expiresAt,
    })
    .from(trashUnits)
    .where(eq(trashUnits.ownerId, accountId))
    .orderBy(asc(trashUnits.deletedAt), asc(trashUnits.id));
  if (units.length === 0) return [];
  const members = await tx
    .select({
      id: containers.id,
      kind: containers.kind,
      name: containers.name,
      parentId: containers.parentId,
      unitId: containers.trashUnitId,
    })
    .from(containers)
    .where(
      inArray(
        containers.trashUnitId,
        units.map((unit) => unit.id),
      ),
    );
  const titles = await tx
    .select({ id: albums.id, title: albums.title, artist: albums.artistCredit })
    .from(albums)
    .where(
      inArray(
        albums.id,
        units.filter((unit) => unit.kind === "album").map((unit) => unit.rootId),
      ),
    );
  const byUnit = Map.groupBy(members, (member) => member.unitId);
  const byAlbum = new Map(titles.map((album) => [album.id, album]));
  return units.map((unit) => {
    const own = byUnit.get(unit.id) ?? [];
    const album = unit.kind === "album" ? byAlbum.get(unit.rootId) : undefined;
    const name =
      unit.kind === "album"
        ? (album?.title ?? "")
        : (own.find((member) => member.id === unit.rootId)?.name ?? "");
    return trashUnitOf(unit, name, own, album?.artist ?? null);
  });
}

/** An entry as clients see it, with `addedAt` as the ISO string the protocol carries. */
export const membershipOf = (row: Omit<Membership, "addedAt"> & { addedAt: Date }): Membership => ({
  ...row,
  addedAt: row.addedAt.toISOString(),
});
