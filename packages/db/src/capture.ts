// What capture reads before the owner's write lock, while it asks MusicBrainz (TS-44): which release groups the
// owner already has albums of, and which saved albums might be under a release group MusicBrainz has since merged
// into the captured one. The command matches again under the lock, so these only decide what to ask.

import { and, asc, count, eq, gt, inArray, isNotNull, ne, or, sql } from "drizzle-orm";

import { searchKey } from "@tonaris/domain";

import type { Database } from "./client";
import { albums, mutations } from "./schema";

/** Merge candidates asked about per capture, at most: each costs a MusicBrainz lookup at 1 a second. */
export const maxMergeCandidates = 5;

/**
 * The owner's album saved as each of `releaseGroupIds`, Trash included, preferring an active one: what a `match`
 * answer's candidates already are in the collection.
 */
export async function savedAlbumsOf(
  db: Database,
  ownerId: string,
  releaseGroupIds: readonly string[],
): Promise<Map<string, string>> {
  if (releaseGroupIds.length === 0) return new Map();
  const rows = await db
    .select({ albumId: albums.id, releaseGroupId: albums.mbReleaseGroupId })
    .from(albums)
    .where(and(eq(albums.ownerId, ownerId), inArray(albums.mbReleaseGroupId, [...releaseGroupIds])))
    .orderBy(sql`${albums.trashedAt} is not null`, asc(albums.id));
  const saved = new Map<string, string>();
  for (const { albumId, releaseGroupId } of rows) {
    if (releaseGroupId && !saved.has(releaseGroupId)) saved.set(releaseGroupId, albumId);
  }
  return saved;
}

/**
 * The owner's albums, Trash included, that may be saved as a release group MusicBrainz merged into
 * `releaseGroupId` (TS-44): another release group, the same artist, and a title one of whose keys contains the
 * other, as "Shoot for the Stars Aim for the Moon (Deluxe)" does. Similarity only picks whom to ask; MusicBrainz's
 * answer for each saved release group decides. Active albums first, at most `maxMergeCandidates`.
 */
export async function mergeCandidates(
  db: Database,
  ownerId: string,
  {
    releaseGroupId,
    title,
    artistCredit,
  }: { releaseGroupId: string; title: string; artistCredit: string },
): Promise<{ albumId: string; releaseGroupId: string }[]> {
  const titleKey = searchKey(title);
  if (titleKey === "") return [];
  const rows = await db
    .select({ albumId: albums.id, releaseGroupId: albums.mbReleaseGroupId })
    .from(albums)
    .where(
      and(
        eq(albums.ownerId, ownerId),
        isNotNull(albums.mbReleaseGroupId),
        ne(albums.mbReleaseGroupId, releaseGroupId),
        eq(albums.searchArtistKey, searchKey(artistCredit)),
        or(
          sql`strpos(${albums.searchTitleKey}, ${titleKey}) > 0`,
          sql`strpos(${titleKey}, ${albums.searchTitleKey}) > 0`,
        ),
      ),
    )
    .orderBy(sql`${albums.trashedAt} is not null`, asc(albums.id))
    .limit(maxMergeCandidates);
  return rows.flatMap((row) =>
    row.releaseGroupId ? [{ albumId: row.albumId, releaseGroupId: row.releaseGroupId }] : [],
  );
}

/**
 * The account's captures received after `since`, other than `mutationId` (TS-18): what the hourly limit counts. Each
 * capture's row is written when it is claimed, so ones still running count too.
 */
export async function capturesSince(
  db: Database,
  accountId: string,
  since: Date,
  mutationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(mutations)
    .where(
      and(
        eq(mutations.accountId, accountId),
        eq(mutations.name, "album.capture"),
        gt(mutations.receivedAt, since),
        ne(mutations.id, mutationId),
      ),
    );
  return row?.count ?? 0;
}
