// The folder hierarchy's walks as recursive CTEs (TS-31): down from containers to their active descendants, and up
// from one to the folders above it. Each is cut off past the depth limit, so that even a cycle in damaged data can't
// run away. Callers put a fragment after `with recursive` and read the CTE it names.

import { eq, sql, type SQL } from "drizzle-orm";

import { maxContainerDepth } from "@tonaris/domain";

import { containers } from "./schema";

/**
 * `tree (id, root, level)`: the active containers `roots` picks, each at level 1 as its own root, and their active
 * descendants, each with the root it is under. `roots` is a condition on `containers`, such as
 * `eq(containers.id, id)`.
 */
export function descendantsCte(roots: SQL): SQL {
  return sql`tree (id, root, level) as (
    select ${containers.id}, ${containers.id}, 1 from ${containers}
    where ${roots} and ${containers.trashedAt} is null
    union all
    select c.id, t.root, t.level + 1 from ${containers} c join tree t on c.parent_id = t.id
    where c.trashed_at is null and t.level <= ${maxContainerDepth}
  )`;
}

/**
 * `up (id, parent_id, level)`: the container `id` at level 1, and the folders above it, nearest first. With `active`,
 * only while each is active: a container in Trash ends the walk, and `id` in Trash gives none.
 */
export function ancestorsCte(id: string, { active = false }: { active?: boolean } = {}): SQL {
  const start = active
    ? sql`${eq(containers.id, id)} and ${containers.trashedAt} is null`
    : eq(containers.id, id);
  return sql`up (id, parent_id, level) as (
    select ${containers.id}, ${containers.parentId}, 1 from ${containers} where ${start}
    union all
    select c.id, c.parent_id, up.level + 1 from ${containers} c join up on c.id = up.parent_id
    where ${active ? sql`c.trashed_at is null and ` : sql``}up.level <= ${maxContainerDepth}
  )`;
}
