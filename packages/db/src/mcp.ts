// What MCP needs from storage (TS-60–TS-63): the connection behind a token, the connection list and revocation
// for Settings (TS-61), and what the first tools read and write. Connections are Better Auth's consents (TS-30);
// their scopes carry the mode (`mcpModeOf`). What a gated deletion or match would touch is read here for its approval;
// the operations themselves are the app's commands (TON-83).

import { and, asc, count, desc, eq, inArray, isNull, notExists, sql } from "drizzle-orm";

import {
  deletionImpact,
  type AlbumDeletionTarget,
  type ContainerKind,
  type DeletionTargets,
} from "@tonaris/domain";

import { albumsOfReleaseGroupIn } from "./album-writes";
import type { Database, Transaction } from "./client";
import { recordInLedger } from "./ledger";
import {
  albums,
  containers,
  memberships,
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  trashUnits,
} from "./schema";
import { impactState } from "./sharing-impact";

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ConnectionRow = {
  id: string;
  clientId: string;
  /** The name the client gave itself, if any (DS-85 labels it "as provided by the client"). */
  clientName: string | null;
  scopes: string[];
  createdAt: Date;
  /** The last MCP call through it, to the minute; null before the first (DS-86). */
  lastUsedAt: Date | null;
};

const connectionColumns = {
  id: oauthConsents.id,
  clientId: oauthConsents.clientId,
  clientName: oauthClients.name,
  scopes: oauthConsents.scopes,
  createdAt: oauthConsents.createdAt,
  lastUsedAt: oauthConsents.lastUsedAt,
};

/** How stale a connection's last-used time may get before a call records it again: one write a minute at most. */
export const connectionUseInterval = 60_000;

/** `userId`'s connection to `clientId`: what an MCP token is checked against on every call. */
export async function findConnection(
  db: Database,
  { userId, clientId }: { userId: string; clientId: string },
): Promise<ConnectionRow | undefined> {
  const [connection] = await db
    .select(connectionColumns)
    .from(oauthConsents)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
    .where(and(eq(oauthConsents.userId, userId), eq(oauthConsents.clientId, clientId)));
  return connection;
}

/**
 * Records a call through the connection at `now`, unless one was recorded within `connectionUseInterval`, so an
 * agent's burst of calls writes once (DS-86).
 */
export async function recordConnectionUse(
  db: Database,
  connection: Pick<ConnectionRow, "id" | "lastUsedAt">,
  now: Date = new Date(),
): Promise<void> {
  if (
    connection.lastUsedAt &&
    now.getTime() - connection.lastUsedAt.getTime() < connectionUseInterval
  ) {
    return;
  }
  await db
    .update(oauthConsents)
    .set({ lastUsedAt: now })
    .where(eq(oauthConsents.id, connection.id));
}

/** `userId`'s connections, newest first (DS-86). */
export function listConnections(db: Database, userId: string): Promise<ConnectionRow[]> {
  return (
    db
      .select(connectionColumns)
      .from(oauthConsents)
      .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
      .where(eq(oauthConsents.userId, userId))
      // Better Auth stamps consents to the second; the UUIDv7 ID breaks ties in the same order.
      .orderBy(desc(oauthConsents.createdAt), desc(oauthConsents.id))
  );
}

/**
 * Revokes `userId`'s connection `id`: the consent goes, with every token the client holds for them. Access
 * tokens are JWTs that live up to an hour, so MCP checks the connection on each call rather than trusting them.
 * Returns whether there was such a connection.
 */
export function revokeConnection(
  db: Database,
  { userId, id }: { userId: string; id: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [consent] = await tx
      .delete(oauthConsents)
      .where(and(eq(oauthConsents.id, id), eq(oauthConsents.userId, userId)))
      .returning({ clientId: oauthConsents.clientId });
    if (!consent) return false;
    const ofGrant = (table: typeof oauthRefreshTokens | typeof oauthAccessTokens) =>
      and(eq(table.userId, userId), eq(table.clientId, consent.clientId));
    await tx.delete(oauthAccessTokens).where(ofGrant(oauthAccessTokens));
    await tx.delete(oauthRefreshTokens).where(ofGrant(oauthRefreshTokens));
    await recordInLedger(tx, { type: "connection.revoked", userId, clientId: consent.clientId });
    return true;
  });
}

export type CollectionOverview = {
  albums: number;
  unsorted: number;
  lists: number;
  folders: number;
  trashUnits: number;
};

/** Counts for `get_overview` (TS-63), so an agent can plan without listing the collection. */
export async function collectionOverview(
  db: Database,
  ownerId: string,
): Promise<CollectionOverview> {
  const activeAlbum = and(eq(albums.ownerId, ownerId), isNull(albums.trashedAt));
  const [albumCounts] = await db
    .select({
      albums: count(),
      // Unsorted: active albums in no active list (FR-01.9). It is this query, never stored (TS-13).
      unsorted: sql<number>`count(*) filter (where ${notExists(
        db
          .select({ one: sql`1` })
          .from(memberships)
          .innerJoin(containers, eq(containers.id, memberships.listId))
          .where(and(eq(memberships.albumId, albums.id), isNull(containers.trashedAt))),
      )})`.mapWith(Number),
    })
    .from(albums)
    .where(activeAlbum);
  const containerCounts = await db
    .select({ kind: containers.kind, count: count() })
    .from(containers)
    .where(and(eq(containers.ownerId, ownerId), isNull(containers.trashedAt)))
    .groupBy(containers.kind);
  const [trash] = await db
    .select({ count: count() })
    .from(trashUnits)
    .where(eq(trashUnits.ownerId, ownerId));
  const ofKind = (kind: string) => containerCounts.find((row) => row.kind === kind)?.count ?? 0;
  return {
    albums: albumCounts?.albums ?? 0,
    unsorted: albumCounts?.unsorted ?? 0,
    lists: ofKind("list"),
    folders: ofKind("folder"),
    trashUnits: trash?.count ?? 0,
  };
}

export type AlbumMatch = {
  id: string;
  title: string;
  artistCredit: string;
  originalYear: number | null;
};

export type ContainerRef = { id: string; kind: ContainerKind; name: string };

export type ContainerListing =
  | { kind: "root" | "folder"; container: ContainerRef | null; children: ContainerRef[] }
  | { kind: "list"; container: ContainerRef; albums: AlbumMatch[]; totalAlbums: number }
  | { kind: "missing" };

/**
 * What `list_container` shows (TS-63): the root's or a folder's active folders and lists, or a list's active
 * albums, the first `limit` in the order they were added.
 */
export async function listContainer(
  db: Database,
  { ownerId, containerId, limit }: { ownerId: string; containerId?: string; limit: number },
): Promise<ContainerListing> {
  const ref = { id: containers.id, kind: containers.kind, name: containers.name };
  const active = and(eq(containers.ownerId, ownerId), isNull(containers.trashedAt));
  let container: ContainerRef | null = null;
  if (containerId) {
    const [found] = await db
      .select(ref)
      .from(containers)
      .where(and(active, eq(containers.id, containerId)));
    if (!found) return { kind: "missing" };
    container = found;
  }
  if (container?.kind === "list") {
    const inList = and(
      eq(memberships.listId, container.id),
      eq(albums.ownerId, ownerId),
      isNull(albums.trashedAt),
    );
    const rows = await db
      .select({
        id: albums.id,
        title: albums.title,
        artistCredit: albums.artistCredit,
        originalYear: albums.originalYear,
      })
      .from(memberships)
      .innerJoin(albums, eq(albums.id, memberships.albumId))
      .where(inList)
      .orderBy(asc(memberships.addedAt), asc(albums.id))
      .limit(limit);
    const [total] = await db
      .select({ count: count() })
      .from(memberships)
      .innerJoin(albums, eq(albums.id, memberships.albumId))
      .where(inList);
    return { kind: "list", container, albums: rows, totalAlbums: total?.count ?? 0 };
  }
  const children = await db
    .select(ref)
    .from(containers)
    .where(
      and(active, container ? eq(containers.parentId, container.id) : isNull(containers.parentId)),
    )
    .orderBy(asc(containers.kind), asc(containers.nameKey));
  return { kind: container ? "folder" : "root", container, children };
}

/**
 * The owner's active albums among `albumIds`, each with the active lists it is in: what deleting them touches
 * (FR-14.1). `lock` holds the albums until the transaction ends, so no list can gain one meanwhile (adding a
 * membership needs a key-share lock on its album).
 */
export async function albumDeletionTargets(
  db: Executor,
  {
    ownerId,
    albumIds,
    lock = false,
  }: { ownerId: string; albumIds: readonly string[]; lock?: boolean },
): Promise<AlbumDeletionTarget[]> {
  const query = db
    .select({ id: albums.id, title: albums.title, artist: albums.artistCredit })
    .from(albums)
    .where(
      and(eq(albums.ownerId, ownerId), inArray(albums.id, [...albumIds]), isNull(albums.trashedAt)),
    );
  const found = lock ? await query.for("update") : await query;
  if (found.length === 0) return [];
  const lists = await db
    .select({ albumId: memberships.albumId, id: containers.id, name: containers.name })
    .from(memberships)
    .innerJoin(containers, eq(containers.id, memberships.listId))
    .where(
      and(
        inArray(
          memberships.albumId,
          found.map((album) => album.id),
        ),
        isNull(containers.trashedAt),
      ),
    );
  return found.map(({ id, title, artist }) => ({
    id,
    title,
    artist,
    lists: lists
      .filter((list) => list.albumId === id)
      .map((list) => ({ id: list.id, name: list.name })),
  }));
}

/**
 * What deleting `albumIds` and `containerIds` to Trash would do (FR-10.6, FR-07.14), for the approval: the owner's
 * active albums among them with the lists each leaves; the active folders and lists, each with what goes with it; the
 * albums left in no list, which go to Unsorted; and who no longer sees it. A container inside another one deleted goes
 * with it, so it is left out. `missing` names the IDs that are nothing active of the owner's.
 */
export async function deletionTargets(
  tx: Transaction,
  {
    ownerId,
    albumIds,
    containerIds,
  }: { ownerId: string; albumIds: readonly string[]; containerIds: readonly string[] },
): Promise<DeletionTargets & { missing: string[]; containerIds: string[] }> {
  const albumTargets =
    albumIds.length > 0 ? await albumDeletionTargets(tx, { ownerId, albumIds }) : [];
  const places = await tx
    .select({
      id: containers.id,
      kind: containers.kind,
      name: containers.name,
      parentId: containers.parentId,
    })
    .from(containers)
    .where(and(eq(containers.ownerId, ownerId), isNull(containers.trashedAt)));
  const byId = new Map(places.map((place) => [place.id, place]));
  const children = Map.groupBy(places, (place) => place.parentId);
  const asked = new Set(containerIds.filter((id) => byId.has(id)));
  const within = (id: string) => {
    for (
      let at = byId.get(id)?.parentId ?? null;
      at !== null;
      at = byId.get(at)?.parentId ?? null
    ) {
      if (asked.has(at)) return true;
    }
    return false;
  };
  const roots = [...asked].filter((id) => !within(id));
  const subtree = (id: string) => {
    const ids = [id];
    for (let at = 0; at < ids.length; at += 1) {
      ids.push(...(children.get(ids[at] ?? "") ?? []).map((child) => child.id));
    }
    return ids;
  };
  const deleted = new Set(roots.flatMap(subtree));
  const containerTargets = roots.map((id) => {
    const below = subtree(id).slice(1);
    const place = byId.get(id);
    return {
      id,
      kind: place?.kind ?? "list",
      name: place?.name ?? "",
      folders: below.filter((each) => byId.get(each)?.kind === "folder").length,
      lists: below.filter((each) => byId.get(each)?.kind === "list").length,
    };
  });

  // Albums in the deleted lists that are in no other active list go to Unsorted, unless they are deleted too.
  const deletedLists = [...deleted].filter((id) => byId.get(id)?.kind === "list");
  let unsorted = 0;
  if (deletedLists.length > 0) {
    const inDeleted = tx
      .select({ albumId: memberships.albumId })
      .from(memberships)
      .where(inArray(memberships.listId, deletedLists));
    const entries = await tx
      .select({ albumId: memberships.albumId, listId: memberships.listId })
      .from(memberships)
      .innerJoin(albums, eq(albums.id, memberships.albumId))
      .where(and(inArray(memberships.albumId, inDeleted), isNull(albums.trashedAt)));
    const goingToo = new Set(albumTargets.map((album) => album.id));
    for (const [albumId, lists] of Map.groupBy(entries, (entry) => entry.albumId)) {
      if (goingToo.has(albumId)) continue;
      if (lists.every((entry) => deleted.has(entry.listId) || !byId.has(entry.listId)))
        unsorted += 1;
    }
  }

  const { state } = await impactState(tx, ownerId);
  const sharing = deletionImpact(state, {
    containerIds: roots,
    albumListIds: albumTargets.flatMap((album) => album.lists.map((list) => list.id)),
  });
  const found = new Set([...albumTargets.map((album) => album.id), ...asked]);
  return {
    albums: albumTargets,
    containers: containerTargets,
    unsorted,
    sharing,
    containerIds: roots,
    missing: [...albumIds, ...containerIds].filter((id) => !found.has(id)),
  };
}

/** The owner's saved album of `releaseGroupId`, if any, with its active lists: what a confirmed match joins (FR-02.9). */
export async function savedAlbumOfReleaseGroup(
  tx: Transaction,
  { ownerId, releaseGroupId }: { ownerId: string; releaseGroupId: string },
): Promise<AlbumDeletionTarget | undefined> {
  const [saved] = await albumsOfReleaseGroupIn(tx, ownerId, releaseGroupId);
  if (!saved) return undefined;
  const lists = await tx
    .select({ id: containers.id, name: containers.name })
    .from(memberships)
    .innerJoin(containers, eq(containers.id, memberships.listId))
    .where(and(eq(memberships.albumId, saved.id), isNull(containers.trashedAt)));
  return { id: saved.id, title: saved.title, artist: saved.artistCredit, lists };
}

/** The owner's active list `id`'s name, if it is one. */
export async function activeListName(
  tx: Transaction,
  { ownerId, listId }: { ownerId: string; listId: string },
): Promise<string | undefined> {
  const [list] = await tx
    .select({ name: containers.name })
    .from(containers)
    .where(
      and(
        eq(containers.id, listId),
        eq(containers.ownerId, ownerId),
        eq(containers.kind, "list"),
        isNull(containers.trashedAt),
      ),
    );
  return list?.name;
}
