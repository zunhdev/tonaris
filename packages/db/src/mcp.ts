// What MCP needs from storage (TS-60–TS-63): the connection behind a token, the connection list and revocation
// for Settings (TS-61), and what the first tools read and write. Connections are Better Auth's consents (TS-30);
// their scopes carry the mode (`mcpModeOf`). The writes (`addToList`, `trashAlbums`) are TON-23's minimal stand-ins
// for the domain commands M2 and M5 bring, which also record them in the change log (TS-20).

import { and, asc, count, desc, eq, gt, inArray, isNull, notExists, or, sql } from "drizzle-orm";

import {
  albumDeletionScope,
  scopeHash,
  searchKey,
  trashRetentionDays,
  uuidv7,
  type AlbumDeletionScope,
  type AlbumDeletionTarget,
  type ContainerKind,
} from "@tonaris/domain";

import type { Database } from "./client";
import {
  albums,
  approvals,
  containers,
  memberships,
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  trashUnits,
} from "./schema";

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ConnectionRow = {
  id: string;
  clientId: string;
  /** The name the client gave itself, if any (DS-85 labels it "as provided by the client"). */
  clientName: string | null;
  scopes: string[];
  createdAt: Date;
};

const connectionColumns = {
  id: oauthConsents.id,
  clientId: oauthConsents.clientId,
  clientName: oauthClients.name,
  scopes: oauthConsents.scopes,
  createdAt: oauthConsents.createdAt,
};

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

/** `%`, `_` and `\` match literally in a LIKE pattern. */
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, (character) => `\\${character}`);

/**
 * Active albums whose title or artist contains `query`, by search key (FR-12.5, TS-12), ordered by artist and
 * title. At most `limit`.
 */
export function searchAlbums(
  db: Database,
  { ownerId, query, limit }: { ownerId: string; query: string; limit: number },
): Promise<AlbumMatch[]> {
  const pattern = `%${likeLiteral(searchKey(query))}%`;
  return db
    .select({
      id: albums.id,
      title: albums.title,
      artistCredit: albums.artistCredit,
      originalYear: albums.originalYear,
    })
    .from(albums)
    .where(
      and(
        eq(albums.ownerId, ownerId),
        isNull(albums.trashedAt),
        or(
          sql`${albums.searchTitleKey} like ${pattern}`,
          sql`${albums.searchArtistKey} like ${pattern}`,
        ),
      ),
    )
    .orderBy(asc(albums.searchArtistKey), asc(albums.searchTitleKey), asc(albums.id))
    .limit(limit);
}

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

export type ListAddition = {
  albumId: string;
  status: "added" | "already_in_list" | "not_found";
};

/**
 * Adds `albumIds` to the owner's active list `listId` (FR-01.6), each album once: an ordinary MCP batch with
 * an outcome per album (FR-10.4, FR-10.9). Undefined when there is no such list.
 */
export async function addToList(
  db: Database,
  { ownerId, listId, albumIds }: { ownerId: string; listId: string; albumIds: readonly string[] },
): Promise<ListAddition[] | undefined> {
  return db.transaction(async (tx) => {
    const [list] = await tx
      .select({ id: containers.id })
      .from(containers)
      .where(
        and(
          eq(containers.id, listId),
          eq(containers.ownerId, ownerId),
          eq(containers.kind, "list"),
          isNull(containers.trashedAt),
        ),
      );
    if (!list) return undefined;
    const found = await tx
      .select({ id: albums.id })
      .from(albums)
      .where(
        and(
          eq(albums.ownerId, ownerId),
          inArray(albums.id, [...albumIds]),
          isNull(albums.trashedAt),
        ),
      );
    const active = new Set(found.map((album) => album.id));
    const added =
      active.size === 0
        ? []
        : await tx
            .insert(memberships)
            .values([...active].map((albumId) => ({ listId, albumId, ownerId })))
            .onConflictDoNothing()
            .returning({ albumId: memberships.albumId });
    const inserted = new Set(added.map((row) => row.albumId));
    return albumIds.map((albumId) => ({
      albumId,
      status: inserted.has(albumId)
        ? "added"
        : active.has(albumId)
          ? "already_in_list"
          : "not_found",
    }));
  });
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

export type TrashResult =
  | { status: "trashed"; albumIds: string[] }
  /** The albums' scope no longer matches the approved one: ask again with `scope`. */
  | { status: "scope_changed"; scope: AlbumDeletionScope }
  /** The approval isn't approved, unused and unexpired for this connection any more. */
  | { status: "not_approved" };

/**
 * Moves albums to Trash under an approval (FR-14.1, TS-64), in one transaction: the scope is computed again with
 * the albums locked, the approval is used only if that scope still hashes as approved, and each album becomes a
 * Trash unit of its own, expiring in 30 days.
 */
export function trashAlbums(
  db: Database,
  {
    ownerId,
    grantId,
    approvalId,
    albumIds,
    now = new Date(),
  }: {
    ownerId: string;
    grantId: string;
    approvalId: string;
    albumIds: readonly string[];
    now?: Date;
  },
): Promise<TrashResult> {
  return db.transaction(async (tx) => {
    const targets = await albumDeletionTargets(tx, { ownerId, albumIds, lock: true });
    const scope = albumDeletionScope(targets);
    const used = await tx
      .update(approvals)
      .set({ status: "used", usedAt: now })
      .where(
        and(
          eq(approvals.id, approvalId),
          eq(approvals.grantId, grantId),
          eq(approvals.status, "approved"),
          isNull(approvals.usedAt),
          gt(approvals.expiresAt, now),
          eq(approvals.scopeHash, await scopeHash(scope)),
        ),
      )
      .returning({ id: approvals.id });
    if (used.length === 0) {
      // Nothing was used. Only an approval that is otherwise usable failed on its scope.
      const [approval] = await tx
        .select()
        .from(approvals)
        .where(and(eq(approvals.id, approvalId), eq(approvals.grantId, grantId)));
      const usable =
        approval?.status === "approved" && approval.expiresAt.getTime() > now.getTime();
      return usable && targets.length > 0
        ? { status: "scope_changed", scope }
        : { status: "not_approved" };
    }
    const expiresAt = new Date(now.getTime() + trashRetentionDays * 86_400_000);
    const units = targets.map((album) => ({
      id: uuidv7(),
      ownerId,
      kind: "album" as const,
      rootId: album.id,
      deletedAt: now,
      expiresAt,
    }));
    await tx.insert(trashUnits).values(units);
    await Promise.all(
      units.map((unit) =>
        tx
          .update(albums)
          .set({ trashedAt: now, trashUnitId: unit.id })
          .where(eq(albums.id, unit.rootId)),
      ),
    );
    return { status: "trashed", albumIds: targets.map((album) => album.id) };
  });
}
