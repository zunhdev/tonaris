// Albums by their service links (TS-11, TS-41 step 1). Links are written with TON-46; `entity_id` holds
// `linkEntityId()` of the link, so a link is found again whatever form it was pasted in.

import { and, eq } from "drizzle-orm";

import type { StreamingService } from "@tonaris/domain";

import type { Database } from "./client";
import { albumServiceLinks } from "./schema";

/** The owner's album with this link, Trash included (FR-14.4), if any. */
export async function findLinkedAlbum(
  db: Database,
  ownerId: string,
  service: StreamingService,
  entityId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ albumId: albumServiceLinks.albumId })
    .from(albumServiceLinks)
    .where(
      and(
        eq(albumServiceLinks.ownerId, ownerId),
        eq(albumServiceLinks.service, service),
        eq(albumServiceLinks.entityId, entityId),
      ),
    )
    .limit(1);
  return row?.albumId;
}
