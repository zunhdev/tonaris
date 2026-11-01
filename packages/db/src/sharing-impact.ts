// The sharing consequences of an owner's move or recovery (FR-07.9, FR-07.10, FR-07.14; DS-69), for previews: the
// owner's containers and who each is shared with, and the Trash unit a recovery names, read in one repeatable-read
// transaction so the parts agree, with the domain's rules deciding. Read-only.

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  impactOf,
  openGrantStatuses,
  type ImpactQuery,
  type ImpactState,
  type SharingImpact,
} from "@tonaris/domain";

import { readSnapshot, type Database, type Transaction } from "./client";
import { activeListsOf } from "./columns";
import { containers, shareGrants, shareLinks, trashUnits, users } from "./schema";

export type { ImpactQuery } from "@tonaris/domain";

/** The owner's sharing, and which of their containers are folders. */
export async function impactState(
  tx: Transaction,
  ownerId: string,
): Promise<{ state: ImpactState; folders: Set<string> }> {
  const [rows, people, links] = await Promise.all([
    tx
      .select({
        id: containers.id,
        parentId: containers.parentId,
        name: containers.name,
        kind: containers.kind,
        trashedAt: containers.trashedAt,
      })
      .from(containers)
      .where(eq(containers.ownerId, ownerId)),
    tx
      .select({
        containerId: shareGrants.containerId,
        personId: shareGrants.granteeId,
        displayName: users.displayName,
        email: shareGrants.invitedEmail,
        status: shareGrants.status,
      })
      .from(shareGrants)
      .innerJoin(containers, eq(containers.id, shareGrants.containerId))
      .innerJoin(users, eq(users.id, shareGrants.granteeId))
      .where(
        and(eq(containers.ownerId, ownerId), inArray(shareGrants.status, [...openGrantStatuses])),
      ),
    tx
      .select({ containerId: shareLinks.containerId })
      .from(shareLinks)
      .innerJoin(containers, eq(containers.id, shareLinks.containerId))
      .where(and(eq(containers.ownerId, ownerId), isNull(shareLinks.revokedAt))),
  ]);
  const state: ImpactState = {
    containers: rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      trashed: row.trashedAt !== null,
    })),
    people: people.map((person) => ({
      containerId: person.containerId,
      personId: person.personId,
      name: person.displayName ?? person.email,
      pending: person.status === "pending",
    })),
    links,
  };
  return {
    state,
    folders: new Set(rows.filter((row) => row.kind === "folder").map((row) => row.id)),
  };
}

/** What `query` would do to the owner's sharing, as the domain's `impactOf` decides, from one snapshot. */
export function sharingImpact(
  db: Database,
  ownerId: string,
  query: ImpactQuery,
): Promise<SharingImpact | "not_found" | "invalid"> {
  return readSnapshot(db, async (tx) => {
    const { state, folders } = await impactState(tx, ownerId);
    const owned = { ...state, folders };
    if (query.kind === "move") return impactOf(owned, query);

    const [unit] = await tx
      .select({ kind: trashUnits.kind, rootId: trashUnits.rootId })
      .from(trashUnits)
      .where(and(eq(trashUnits.id, query.unitId), eq(trashUnits.ownerId, ownerId)));
    if (!unit) return impactOf(owned, query);
    if (unit.kind === "album") {
      const lists = await activeListsOf(tx, [unit.rootId]);
      return impactOf(owned, query, {
        kind: "album",
        rootId: unit.rootId,
        listIds: lists.map((list) => list.id),
      });
    }
    const members = await tx
      .select({ id: containers.id })
      .from(containers)
      .where(eq(containers.trashUnitId, query.unitId));
    return impactOf(owned, query, {
      kind: unit.kind,
      rootId: unit.rootId,
      memberIds: members.map((row) => row.id),
    });
  });
}
