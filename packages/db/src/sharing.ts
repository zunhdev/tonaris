// Reads through sharing (FR-07.8–FR-07.13; TS-31 to TS-33): a link found by its token's hash, what a viewer may
// read, and a shared container as its viewers see it. Access is `readableContainers` in packages/domain, walked here
// with recursive CTEs over active containers only, cut off past the depth limit as the other hierarchy walks are;
// property tests hold the two equal. Also the owner's view of a container's sharing, for the dialog (DS-65); the
// sharing commands are the domain's, run through `executeMutation`.

import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import {
  isChoiceType,
  maxContainerDepth,
  shareTokenHash,
  type CustomField,
  type ServiceLink,
  type SharedSnapshot,
  type ShareSettings,
  type ShareViewer,
} from "@tonaris/domain";

import type { Database, Transaction } from "./client";
import { sendingStale } from "./invitations";
import {
  albums,
  albumServiceLinks,
  containers,
  fieldDefinitions,
  fieldOptions,
  memberships,
  savedReferences,
  shareGrants,
  shareLinks,
  users,
} from "./schema";
import {
  albumColumns,
  containerColumns,
  membershipColumns,
  membershipOf,
  valuesOfAlbums,
} from "./sync";

/** The live link a token opens (TS-32): looked up by the token's SHA-256, never the token itself. */
export async function findShareLink(
  db: Database | Transaction,
  token: string,
): Promise<{ id: string; containerId: string } | undefined> {
  const hash = Buffer.from(await shareTokenHash(token));
  const [link] = await db
    .select({ id: shareLinks.id, containerId: shareLinks.containerId })
    .from(shareLinks)
    .where(and(eq(shareLinks.tokenHash, hash), isNull(shareLinks.revokedAt)));
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

/** The container `id` and its active descendants, if it is active. */
async function activeSubtree(tx: Transaction, id: string): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    with recursive tree (id, level) as (
      select id, 1 from ${containers} where id = ${id} and trashed_at is null
      union all
      select c.id, t.level + 1 from ${containers} c join tree t on c.parent_id = t.id
      where c.trashed_at is null and t.level <= ${maxContainerDepth}
    )
    select distinct id from tree`);
  return rows.map((row) => row.id);
}

/**
 * The container `id` as `viewer` sees it (FR-07.11, FR-07.12): undefined unless they may read it. Read in one
 * repeatable-read transaction, as the bootstrap is, so its parts agree.
 */
export function sharedSnapshot(
  db: Database,
  viewer: ShareViewer,
  id: string,
): Promise<SharedSnapshot | undefined> {
  return db.transaction(
    async (tx) => {
      if (!(await canReadContainer(tx, viewer, id))) return undefined;
      const ids = await activeSubtree(tx, id);
      const [owner] = await tx
        .select({ displayName: users.displayName })
        .from(containers)
        .innerJoin(users, eq(users.id, containers.ownerId))
        .where(eq(containers.id, id));
      const shown = await tx
        .select(containerColumns)
        .from(containers)
        .where(inArray(containers.id, ids))
        .orderBy(asc(containers.id));
      // Only entries of active albums count (TS-13); every list here is active.
      const entries = await tx
        .select(membershipColumns)
        .from(memberships)
        .innerJoin(albums, eq(albums.id, memberships.albumId))
        .where(and(inArray(memberships.listId, ids), isNull(albums.trashedAt)))
        .orderBy(asc(memberships.listId), asc(memberships.albumId));
      const albumIds = [...new Set(entries.map((entry) => entry.albumId))];
      const inScope = albumIds.length === 0 ? sql`false` : inArray(albums.id, albumIds);
      const shownAlbums = await tx
        .select(albumColumns)
        .from(albums)
        .where(inScope)
        .orderBy(asc(albums.id));
      const links: ServiceLink[] =
        albumIds.length === 0
          ? []
          : await tx
              .select({
                albumId: albumServiceLinks.albumId,
                service: albumServiceLinks.service,
                url: albumServiceLinks.url,
              })
              .from(albumServiceLinks)
              .where(inArray(albumServiceLinks.albumId, albumIds))
              .orderBy(asc(albumServiceLinks.albumId), asc(albumServiceLinks.service));
      const fieldValues = await valuesOfAlbums(tx, albumIds);
      return {
        rootId: id,
        owner: { displayName: owner?.displayName ?? null },
        // The root's parent is a folder the viewer may not know of.
        containers: shown.map((each) =>
          each.id === id ? Object.assign(each, { parentId: null }) : each,
        ),
        albums: shownAlbums,
        memberships: entries.map(membershipOf),
        links,
        fields: await usedFields(tx, fieldValues),
        fieldValues,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** The fields `values` use, each with only the options they choose (FR-07.12). */
async function usedFields(
  tx: Transaction,
  values: SharedSnapshot["fieldValues"],
): Promise<CustomField[]> {
  const fieldIds = [...new Set(values.map((each) => each.fieldId))];
  if (fieldIds.length === 0) return [];
  const definitions = await tx
    .select({ id: fieldDefinitions.id, name: fieldDefinitions.name, type: fieldDefinitions.type })
    .from(fieldDefinitions)
    .where(inArray(fieldDefinitions.id, fieldIds))
    .orderBy(asc(fieldDefinitions.id));
  const choice = new Set(definitions.filter(({ type }) => isChoiceType(type)).map(({ id }) => id));
  // A choice field's value is its option's ID, or a multiple choice's IDs.
  const chosen = new Set(
    values
      .filter(({ fieldId }) => choice.has(fieldId))
      .flatMap(({ value }) =>
        Array.isArray(value) ? value : typeof value === "string" ? [value] : [],
      ),
  );
  const options = await tx
    .select({ id: fieldOptions.id, fieldId: fieldOptions.fieldId, label: fieldOptions.label })
    .from(fieldOptions)
    .where(inArray(fieldOptions.fieldId, fieldIds))
    .orderBy(sql`${fieldOptions.sortKey} collate "C"`, asc(fieldOptions.id));
  return definitions.map(({ id, name, type }) => ({
    id,
    name,
    type,
    options: options
      .filter((option) => option.fieldId === id && chosen.has(option.id))
      .map((option) => ({ id: option.id, label: option.label })),
  }));
}

/** A folder's or list's sharing as its owner's dialog shows it (DS-65), with the live link's ID for the API's URL. */
export type ShareSettingsRow = Omit<ShareSettings, "link"> & { link: { id: string } | null };

/**
 * The sharing of the container `id` (DS-65), for `ownerId` only: undefined for anyone else's. Invitations are the
 * open ones; folders above are listed when they have any open invitation or a live link, nearest first.
 */
export async function shareSettings(
  db: Database,
  ownerId: string,
  id: string,
  now: Date = new Date(),
): Promise<ShareSettingsRow | undefined> {
  const [container] = await db
    .select({ ownerId: containers.ownerId, parentId: containers.parentId })
    .from(containers)
    .where(eq(containers.id, id));
  if (container?.ownerId !== ownerId) return undefined;
  const [owner] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, ownerId));
  const invitations = await db
    .select({
      id: shareGrants.id,
      email: shareGrants.invitedEmail,
      displayName: users.displayName,
      status: shareGrants.status,
      emailStatus: shareGrants.emailStatus,
      updatedAt: shareGrants.updatedAt,
    })
    .from(shareGrants)
    .innerJoin(users, eq(users.id, shareGrants.granteeId))
    .where(
      and(eq(shareGrants.containerId, id), inArray(shareGrants.status, ["pending", "accepted"])),
    )
    .orderBy(asc(shareGrants.id));
  const [link] = await db
    .select({ id: shareLinks.id })
    .from(shareLinks)
    .where(and(eq(shareLinks.containerId, id), isNull(shareLinks.revokedAt)));
  const above =
    container.parentId === null
      ? []
      : await db.execute<{ id: string; name: string; people: number; link: boolean }>(sql`
          with recursive up (id, parent_id, name, level) as (
            select id, parent_id, name, 1 from ${containers} where id = ${container.parentId}
            union all
            select c.id, c.parent_id, c.name, up.level + 1 from ${containers} c join up on c.id = up.parent_id
            where up.level <= ${maxContainerDepth}
          )
          select up.id, up.name,
            (select count(*) from ${shareGrants} g
              where g.container_id = up.id and g.status in ('pending', 'accepted'))::int as people,
            exists (select 1 from ${shareLinks} l where l.container_id = up.id and l.revoked_at is null) as link
          from up order by up.level`);
  return {
    containerId: id,
    ownerDisplayName: owner?.displayName ?? null,
    invitations: invitations.flatMap(({ updatedAt, emailStatus, ...each }) =>
      each.status === "pending" || each.status === "accepted"
        ? [
            {
              ...each,
              status: each.status,
              // A send that never reported back is unconfirmed: the server may have stopped (FR-07.5).
              emailStatus:
                emailStatus === "sending" && sendingStale(updatedAt, now) ? "unknown" : emailStatus,
            },
          ]
        : [],
    ),
    link: link ?? null,
    inherited: above
      .filter((each) => each.people > 0 || each.link)
      .map(({ id: containerId, name, people, link: linked }) => ({
        containerId,
        name,
        people,
        link: linked,
      })),
  };
}
