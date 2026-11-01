// Album writes that enrichment and capture share (TS-15, TS-42, TS-44): reading an album as they see it, with its
// identity and artwork, and writing an enrichment plan. Both run on the owner's write transaction.

import { and, asc, eq, sql } from "drizzle-orm";

import type { CaptureTarget, EnrichmentPlan } from "@tonaris/domain";

import type { Transaction } from "./client";
import { albumSearchKeys } from "./columns";
import { writeProvenance } from "./provenance";
import { albums } from "./schema";

/** The columns of an album as capture and enrichment see it. */
export const captureTargetColumns = {
  id: albums.id,
  ownerId: albums.ownerId,
  title: albums.title,
  artistCredit: albums.artistCredit,
  releaseType: albums.releaseType,
  isLive: albums.isLive,
  originalYear: albums.originalYear,
  recordingYearStart: albums.recordingYearStart,
  recordingYearEnd: albums.recordingYearEnd,
  artworkUrl: albums.artworkUrl,
  releaseGroupId: albums.mbReleaseGroupId,
  trashedAt: albums.trashedAt,
};

/** A row of `captureTargetColumns` as `CaptureTarget`. */
export function captureTargetOf({
  trashedAt,
  ...album
}: Omit<CaptureTarget, "trashed"> & { trashedAt: Date | null }): CaptureTarget {
  return { ...album, trashed: trashedAt !== null };
}

/** The album, whoever owns it, in Trash or not. */
export async function findCaptureTarget(
  tx: Transaction,
  id: string,
): Promise<CaptureTarget | undefined> {
  const [row] = await tx.select(captureTargetColumns).from(albums).where(eq(albums.id, id));
  return row && captureTargetOf(row);
}

/** The owner's albums saved as `releaseGroupId`, Trash included: active ones first, then by ID (TS-44). */
export async function albumsOfReleaseGroupIn(
  tx: Transaction,
  ownerId: string,
  releaseGroupId: string,
): Promise<CaptureTarget[]> {
  const rows = await tx
    .select(captureTargetColumns)
    .from(albums)
    .where(and(eq(albums.ownerId, ownerId), eq(albums.mbReleaseGroupId, releaseGroupId)))
    .orderBy(sql`${albums.trashedAt} is not null`, asc(albums.id));
  return rows.map(captureTargetOf);
}

/** Writes `plan`: its filled values with their search keys, the release group, and the provenance (TS-42). */
export async function applyPlan(
  tx: Transaction,
  albumId: string,
  { values, releaseGroupId, provenance }: EnrichmentPlan,
): Promise<void> {
  if (Object.keys(values).length > 0 || releaseGroupId !== undefined) {
    await tx
      .update(albums)
      .set({
        ...values,
        ...(releaseGroupId === undefined ? {} : { mbReleaseGroupId: releaseGroupId }),
        ...albumSearchKeys(values),
      })
      .where(eq(albums.id, albumId));
  }
  await writeProvenance(tx, albumId, provenance);
}
