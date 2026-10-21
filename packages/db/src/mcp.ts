// What MCP needs from storage (TS-60–TS-63): the connection behind a token, the connection list and revocation
// for Settings (TS-61), and the reads behind the first tools. Connections are Better Auth's consents (TS-30);
// their scopes carry the mode (`mcpModeOf`).

import { and, asc, count, desc, eq, isNull, notExists, or, sql } from "drizzle-orm";

import { searchKey } from "@tonaris/domain";

import type { Database } from "./client";
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
      // Unsorted: active albums in no active list (FR-01.6).
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
