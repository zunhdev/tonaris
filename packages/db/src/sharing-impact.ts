// The sharing consequences of an owner's move or recovery (FR-07.9, FR-07.10, FR-07.14; DS-69), for previews: the
// owner's containers and who each is shared with, read in one repeatable-read transaction so the parts agree, and
// the domain's rules applied to them. Read-only.

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  listsImpact,
  moveImpact,
  recoveryImpact,
  type ImpactState,
  type SharingImpact,
} from "@tonaris/domain";

import { readSnapshot, type Database, type Transaction } from "./client";
import { containers, memberships, shareGrants, shareLinks, trashUnits, users } from "./schema";

/** A move of a folder or list into a folder or the root, or a Trash unit's recovery, by default to where it was. */
export type ImpactQuery =
  | { kind: "move"; id: string; to: string | null }
  | { kind: "recover"; unitId: string; to?: string | null };

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
        and(eq(containers.ownerId, ownerId), inArray(shareGrants.status, ["pending", "accepted"])),
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

/**
 * What `query` would do to the owner's sharing; `not_found` if it names nothing of theirs, `invalid` if the
 * destination isn't an active folder of theirs, or is inside what moves.
 */
export function sharingImpact(
  db: Database,
  ownerId: string,
  query: ImpactQuery,
): Promise<SharingImpact | "not_found" | "invalid"> {
  return readSnapshot(db, async (tx) => {
    const { state, folders } = await impactState(tx, ownerId);
    const byId = new Map(state.containers.map((container) => [container.id, container]));
    const activeFolder = (id: string | null) =>
      id === null || (folders.has(id) && byId.get(id)?.trashed === false);

    if (query.kind === "move") {
      const item = byId.get(query.id);
      if (!item || item.trashed) return "not_found";
      if (!activeFolder(query.to)) return "invalid";
      for (let at = query.to; at !== null; at = byId.get(at)?.parentId ?? null) {
        if (at === query.id) return "invalid";
      }
      return moveImpact(state, query.id, query.to);
    }

    const [unit] = await tx
      .select({ kind: trashUnits.kind, rootId: trashUnits.rootId })
      .from(trashUnits)
      .where(and(eq(trashUnits.id, query.unitId), eq(trashUnits.ownerId, ownerId)));
    if (!unit) return "not_found";
    if (unit.kind === "album") {
      const lists = await tx
        .select({ listId: memberships.listId })
        .from(memberships)
        .innerJoin(containers, eq(containers.id, memberships.listId))
        .where(and(eq(memberships.albumId, unit.rootId), isNull(containers.trashedAt)));
      return listsImpact(
        state,
        lists.map((row) => row.listId),
      );
    }
    const members = await tx
      .select({ id: containers.id })
      .from(containers)
      .where(eq(containers.trashUnitId, query.unitId));
    const where = byId.get(unit.rootId)?.parentId ?? null;
    const to = query.to === undefined ? (activeFolder(where) ? where : null) : query.to;
    if (!activeFolder(to)) return "invalid";
    const ids = [unit.rootId, ...members.map((row) => row.id).filter((id) => id !== unit.rootId)];
    return recoveryImpact(state, ids, to);
  });
}
