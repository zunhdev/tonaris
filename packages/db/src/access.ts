// What a viewer may read through sharing (FR-07.8–FR-07.10; TS-31–TS-33): `readableContainers` in packages/domain,
// walked here with recursive CTEs over active containers only, cut off past the depth limit as the other hierarchy
// walks are; property tests hold the two equal. Also the live link a token's hash opens. Its own module, so the sync
// store and the sharing reads both use it.

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import type { ShareViewer } from "@tonaris/domain";

import type { Executor } from "./client";
import { ancestorsCte, descendantsCte } from "./hierarchy";
import { containers, savedReferences, shareGrants, shareLinks } from "./schema";

/**
 * The live link a token's SHA-256 names, while its folder or list is active (TS-32): Trash suspends a link, as it does
 * an invitation (FR-07.10). The one lookup by token, for the guest routes, the reference check and `share.saveLink`.
 */
export async function linkByTokenHash(
  db: Executor,
  hash: Uint8Array,
): Promise<{ id: string; containerId: string; ownerId: string } | undefined> {
  const [link] = await db
    .select({ id: shareLinks.id, containerId: shareLinks.containerId, ownerId: containers.ownerId })
    .from(shareLinks)
    .innerJoin(containers, eq(containers.id, shareLinks.containerId))
    .where(
      and(
        eq(shareLinks.tokenHash, Buffer.from(hash)),
        isNull(shareLinks.revokedAt),
        isNull(containers.trashedAt),
      ),
    );
  return link;
}

/** The containers `viewer` reads through directly (`sourcesOf` in packages/domain), as SQL. */
function sourcesOf(viewer: ShareViewer): SQL {
  if (viewer.kind === "link") {
    return sql`
      select ${shareLinks.containerId} as id from ${shareLinks}
      where ${shareLinks.id} = ${viewer.linkId} and ${shareLinks.revokedAt} is null`;
  }
  return sql`
    select ${shareGrants.containerId} as id from ${shareGrants}
    where ${shareGrants.granteeId} = ${viewer.userId} and ${shareGrants.status} = 'accepted'
    union
    select ${shareLinks.containerId} from ${savedReferences}
    join ${shareLinks} on ${shareLinks.id} = ${savedReferences.linkId}
    where ${savedReferences.viewerId} = ${viewer.userId} and ${shareLinks.revokedAt} is null`;
}

/** Every container `viewer` may read, each with the sources it is read through: down from each active source. */
export async function readableContainers(
  db: Executor,
  viewer: ShareViewer,
): Promise<Map<string, Set<string>>> {
  const rows = await db.execute<{ id: string; source: string }>(sql`
    with recursive sources (id) as (${sourcesOf(viewer)}),
    ${descendantsCte(sql`${containers.id} in (select id from sources)`)}
    select distinct id, root as source from tree`);
  const readable = new Map<string, Set<string>>();
  for (const { id, source } of rows) readable.set(id, (readable.get(id) ?? new Set()).add(source));
  return readable;
}

/** Whether `viewer` may read the container `id`: up from it while every container is active, is one a source? */
export async function canReadContainer(
  db: Executor,
  viewer: ShareViewer,
  id: string,
): Promise<boolean> {
  const [row] = await db.execute<{ readable: boolean }>(sql`
    with recursive sources (id) as (${sourcesOf(viewer)}),
    ${ancestorsCte(id, { active: true })}
    select exists (select 1 from up join sources on sources.id = up.id) as readable`);
  return row?.readable === true;
}
