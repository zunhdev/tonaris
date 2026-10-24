// Enrichment's writes (TS-42, TS-44): `planEnrichment()` applied to a saved album under the owner's write lock, so
// the plan is made on the album as it is at that moment. A person's edit that commits while MusicBrainz is being
// asked is then a populated value, and kept. Filled values reach the owner's sessions as one album change with no
// mutation id; artwork and the release group aren't on clients' records, so filling only those logs nothing.

import { and, eq } from "drizzle-orm";

import {
  albumFields,
  failure,
  planEnrichment,
  searchKey,
  type AlbumFacts,
  type Change,
  type EnrichmentPlan,
  type Failure,
} from "@tonaris/domain";

import type { Database } from "./client";
import { writeProvenance } from "./provenance";
import { albums } from "./schema";
import { lockAccount, logChanges } from "./sync";

export type Enrichment = { status: "applied"; plan: EnrichmentPlan; changes: Change[] };

const enrichableColumns = {
  id: albums.id,
  title: albums.title,
  artistCredit: albums.artistCredit,
  releaseType: albums.releaseType,
  isLive: albums.isLive,
  originalYear: albums.originalYear,
  recordingYearStart: albums.recordingYearStart,
  recordingYearEnd: albums.recordingYearEnd,
  artworkUrl: albums.artworkUrl,
  releaseGroupId: albums.mbReleaseGroupId,
};

/**
 * Fills the account's album `albumId` from `facts`, as `planEnrichment()` decides, and records the filled values'
 * provenance. Trashed albums are enriched too: matching may bring them back (FR-14.4). Answers the plan and the
 * changes it logged, for the caller to publish, or `not_found` if the account has no such album.
 */
export async function enrichAlbum(
  db: Database,
  accountId: string,
  albumId: string,
  facts: AlbumFacts,
  now: Date = new Date(),
): Promise<Enrichment | Failure> {
  return db.transaction(async (tx) => {
    const seq = await lockAccount(tx, accountId);
    const [row] = await tx
      .select(enrichableColumns)
      .from(albums)
      .where(and(eq(albums.id, albumId), eq(albums.ownerId, accountId)));
    if (!row) return failure("not_found", "This album doesn't exist.");

    const plan = planEnrichment(row, facts, now);
    const { values, releaseGroupId } = plan;
    if (Object.keys(values).length > 0 || releaseGroupId !== undefined) {
      await tx
        .update(albums)
        .set({
          ...values,
          ...(releaseGroupId === undefined ? {} : { mbReleaseGroupId: releaseGroupId }),
          ...(values.title === undefined ? {} : { searchTitleKey: searchKey(values.title) }),
          ...(values.artistCredit === undefined
            ? {}
            : { searchArtistKey: searchKey(values.artistCredit) }),
        })
        .where(eq(albums.id, albumId));
    }
    await writeProvenance(tx, albumId, plan.provenance);

    if (!albumFields.some((field) => values[field] !== undefined)) {
      return { status: "applied", plan, changes: [] };
    }
    // The album as clients hold it: without the artwork and release group they don't carry yet.
    const { artworkUrl: _, releaseGroupId: __, ...data } = { ...row, ...values };
    const changes = await logChanges(
      tx,
      accountId,
      seq,
      [{ entity: "album", id: albumId, op: "update", data }],
      null,
    );
    return { status: "applied", plan, changes };
  });
}

/**
 * The release group the account's album is saved as: null while it is unidentified, or undefined if the account
 * has no such album. Enrichment asks MusicBrainz about it (TS-44).
 */
export async function albumReleaseGroup(
  db: Database,
  accountId: string,
  albumId: string,
): Promise<string | null | undefined> {
  const [row] = await db
    .select({ releaseGroupId: albums.mbReleaseGroupId })
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.ownerId, accountId)));
  return row?.releaseGroupId;
}
