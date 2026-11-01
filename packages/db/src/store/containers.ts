// The store's folders, lists and entries (TS-11, TS-31; FR-01.1–FR-01.8): containers with their name and search keys,
// the hierarchy walked with recursive CTEs, and memberships.

import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";

import type { CollectionStore } from "@tonaris/domain";

import type { Transaction } from "../client";
import { containerColumns, containerNameKeys, membershipColumns, membershipOf } from "../columns";
import { ancestorsCte, descendantsCte } from "../hierarchy";
import { containers, memberships } from "../schema";

/** Folders, lists and their entries, on `tx`. */
export function containerStore(tx: Transaction) {
  return {
    async findContainer(id) {
      const [row] = await tx
        .select({
          ...containerColumns,
          ownerId: containers.ownerId,
          trashedAt: containers.trashedAt,
        })
        .from(containers)
        .where(eq(containers.id, id));
      if (!row) return undefined;
      const { trashedAt, ...container } = row;
      return { ...container, trashed: trashedAt !== null };
    },
    async containerPath(id) {
      const rows = await tx.execute<{ id: string }>(
        sql`with recursive ${ancestorsCte(id)} select id from up order by level`,
      );
      return rows.map((row) => row.id);
    },
    async subtreeDepth(id) {
      const [row] = await tx.execute<{ depth: number | null }>(
        sql`with recursive ${descendantsCte(eq(containers.id, id))}
          select max(level)::int as depth from tree`,
      );
      return row?.depth ?? 0;
    },
    activeChildren(ownerId, parentId) {
      return tx
        .select(containerColumns)
        .from(containers)
        .where(
          and(
            eq(containers.ownerId, ownerId),
            parentId === null ? isNull(containers.parentId) : eq(containers.parentId, parentId),
            isNull(containers.trashedAt),
          ),
        );
    },
    async countContainers(ownerId) {
      const [row] = await tx
        .select({ count: count() })
        .from(containers)
        .where(eq(containers.ownerId, ownerId));
      return row?.count ?? 0;
    },
    async insertContainer(container) {
      await tx.insert(containers).values({
        ...container,
        ...containerNameKeys(container.name),
      });
    },
    async updateContainer(id, values) {
      await tx
        .update(containers)
        .set({
          ...values,
          ...(values.name === undefined ? {} : containerNameKeys(values.name)),
        })
        .where(eq(containers.id, id));
    },

    async findMembership(listId, albumId) {
      const [row] = await tx
        .select(membershipColumns)
        .from(memberships)
        .where(and(eq(memberships.listId, listId), eq(memberships.albumId, albumId)));
      return row && membershipOf(row);
    },
    async countMemberships(ownerId) {
      const [row] = await tx
        .select({ count: count() })
        .from(memberships)
        .where(eq(memberships.ownerId, ownerId));
      return row?.count ?? 0;
    },
    async activeSubtree(id) {
      const rows = await tx.execute<{ id: string }>(
        sql`with recursive ${descendantsCte(eq(containers.id, id))}
          select id from tree order by level, id`,
      );
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return [];
      const found = await tx
        .select(containerColumns)
        .from(containers)
        .where(inArray(containers.id, ids));
      return ids.flatMap((each) => found.filter((row) => row.id === each));
    },
    async listEntries(listIds) {
      if (listIds.length === 0) return [];
      const rows = await tx
        .select(membershipColumns)
        .from(memberships)
        .where(inArray(memberships.listId, listIds))
        .orderBy(asc(memberships.listId), asc(memberships.albumId));
      return rows.map(membershipOf);
    },
    async insertMembership({ addedAt, ...membership }) {
      await tx.insert(memberships).values({ ...membership, addedAt: new Date(addedAt) });
    },
    async deleteMembership(listId, albumId) {
      await tx
        .delete(memberships)
        .where(and(eq(memberships.listId, listId), eq(memberships.albumId, albumId)));
    },
  } satisfies Partial<CollectionStore>;
}
