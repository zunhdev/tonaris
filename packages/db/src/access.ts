// What a viewer may read through sharing (FR-07.8–FR-07.10; TS-31, TS-33): `readableContainers` in packages/domain,
// walked here with recursive CTEs over active containers only, cut off past the depth limit as the other hierarchy
// walks are; property tests hold the two equal. Its own module, so the sync store and the sharing reads both use it.

import { sql, type SQL } from "drizzle-orm";

import { maxContainerDepth, type ShareViewer } from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import { containers, savedReferences, shareGrants, shareLinks } from "./schema";

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
  db: Database | Transaction,
  viewer: ShareViewer,
): Promise<Map<string, Set<string>>> {
  const rows = await db.execute<{ id: string; source: string }>(sql`
    with recursive sources (id) as (${sourcesOf(viewer)}),
    tree (id, source, level) as (
      select c.id, c.id, 1 from ${containers} c join sources s on s.id = c.id where c.trashed_at is null
      union all
      select c.id, t.source, t.level + 1 from ${containers} c join tree t on c.parent_id = t.id
      where c.trashed_at is null and t.level <= ${maxContainerDepth}
    )
    select distinct id, source from tree`);
  const readable = new Map<string, Set<string>>();
  for (const { id, source } of rows) readable.set(id, (readable.get(id) ?? new Set()).add(source));
  return readable;
}

/** Whether `viewer` may read the container `id`: up from it while every container is active, is one a source? */
export async function canReadContainer(
  db: Database | Transaction,
  viewer: ShareViewer,
  id: string,
): Promise<boolean> {
  const [row] = await db.execute<{ readable: boolean }>(sql`
    with recursive sources (id) as (${sourcesOf(viewer)}),
    up (id, parent_id, level) as (
      select id, parent_id, 1 from ${containers} where id = ${id} and trashed_at is null
      union all
      select c.id, c.parent_id, up.level + 1 from ${containers} c join up on c.id = up.parent_id
      where c.trashed_at is null and up.level <= ${maxContainerDepth}
    )
    select exists (select 1 from up join sources on sources.id = up.id) as readable`);
  return row?.readable === true;
}
