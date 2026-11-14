// Deletion-class removals shared by the live paths and a restore's replay (TS-113): ending an account's AI
// connections, and purging a Trash unit's rows. The live paths record their ledger events around these; the replay
// applies the events with them, bare, and applying one again changes nothing.

import { and, eq, inArray, or } from "drizzle-orm";

import type { Transaction } from "./client";
import {
  albums,
  containers,
  oauthAccessTokens,
  oauthConsents,
  oauthRefreshTokens,
  positions,
  trashUnits,
  viewPrefs,
} from "./schema";

/**
 * Ends `userId`'s AI connections to `clientId`, or to every client when it is null (TS-61): the consents, and every
 * token they gave.
 */
export async function endConnections(
  tx: Transaction,
  { userId, clientId }: { userId: string; clientId: string | null },
): Promise<void> {
  const theirs = (
    table: typeof oauthAccessTokens | typeof oauthRefreshTokens | typeof oauthConsents,
  ) =>
    clientId === null
      ? eq(table.userId, userId)
      : and(eq(table.userId, userId), eq(table.clientId, clientId));
  await tx.delete(oauthAccessTokens).where(theirs(oauthAccessTokens));
  await tx.delete(oauthRefreshTokens).where(theirs(oauthRefreshTokens));
  await tx.delete(oauthConsents).where(theirs(oauthConsents));
}

/**
 * Purges a Trash unit's rows for good (FR-01.17): its folders and lists, whose entries cascade, its albums, whose
 * entries, links, values and provenance cascade, and the unit (TS-11). View choices and places refer to a folder,
 * list or album by ID, not by key, so every person's choices for a purged view and places of a purged item go too.
 */
export async function purgeRows(
  tx: Transaction,
  {
    unitId,
    containerIds,
    albumIds,
  }: { unitId: string; containerIds: readonly string[]; albumIds: readonly string[] },
): Promise<void> {
  if (containerIds.length > 0) {
    const ids = [...containerIds];
    await tx.delete(viewPrefs).where(inArray(viewPrefs.viewKey, ids));
    await tx
      .delete(positions)
      .where(or(inArray(positions.viewKey, ids), inArray(positions.itemId, ids)));
    await tx.delete(containers).where(inArray(containers.id, ids));
  }
  if (albumIds.length > 0) {
    await tx.delete(positions).where(inArray(positions.itemId, [...albumIds]));
    await tx.delete(albums).where(inArray(albums.id, [...albumIds]));
  }
  await tx.delete(trashUnits).where(eq(trashUnits.id, unitId));
}
