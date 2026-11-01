// What MCP's write tools need from storage (TS-22, TS-63): an agent's idempotency key, claimed for the batch it names;
// the values a change is based on when the agent didn't send them (TS-21); and a view's manual sequence, which a move
// is planned against (TS-16).

import { and, eq } from "drizzle-orm";

import type { FieldValueData, StreamingService, ViewPrefsFields } from "@tonaris/domain";

import { readSnapshot, type Database } from "./client";
import { albumColumns } from "./columns";
import { valuesOfAlbums } from "./field-values";
import { containerPage, unsortedPage } from "./mcp-reads";
import {
  albumServiceLinks,
  albums,
  containers,
  mcpOperations,
  positions,
  viewPrefs,
} from "./schema";

/**
 * What claiming a key found: a new batch, the same request sent again under it (its batch, to replay), or a key the
 * connection used for a different request.
 */
export type OperationClaim = { status: "new" | "again"; batchId: string } | { status: "reused" };

/** Claims `key` for `batchId` and its `items`, unless the connection already used it (TS-22). */
export async function claimOperation(
  db: Database,
  {
    grantId,
    key,
    requestHash,
    batchId,
    items,
  }: { grantId: string; key: string; requestHash: string; batchId: string; items: number },
): Promise<OperationClaim> {
  const inserted = await db
    .insert(mcpOperations)
    .values({ grantId, key, requestHash, batchId, items })
    .onConflictDoNothing()
    .returning({ batchId: mcpOperations.batchId });
  if (inserted.length > 0) return { status: "new", batchId };
  const [stored] = await db
    .select({ batchId: mcpOperations.batchId, requestHash: mcpOperations.requestHash })
    .from(mcpOperations)
    .where(and(eq(mcpOperations.grantId, grantId), eq(mcpOperations.key, key)));
  if (!stored || stored.requestHash !== requestHash) return { status: "reused" };
  return { status: "again", batchId: stored.batchId };
}

/** The batch the connection's `key` names, and how many items it has, if the connection used the key. */
export async function findOperation(
  db: Database,
  { grantId, key }: { grantId: string; key: string },
): Promise<{ batchId: string; items: number } | undefined> {
  const [found] = await db
    .select({ batchId: mcpOperations.batchId, items: mcpOperations.items })
    .from(mcpOperations)
    .where(and(eq(mcpOperations.grantId, grantId), eq(mcpOperations.key, key)));
  return found;
}

/** The owner's album's values now, Trash or not, for a change's `base`. */
export async function albumBase(
  db: Database,
  { ownerId, albumId }: { ownerId: string; albumId: string },
) {
  const [found] = await db
    .select(albumColumns)
    .from(albums)
    .where(and(eq(albums.id, albumId), eq(albums.ownerId, ownerId)));
  return found;
}

/** The owner's folder's or list's values now, for a change's `base`. */
export async function containerBase(
  db: Database,
  { ownerId, containerId }: { ownerId: string; containerId: string },
) {
  const [found] = await db
    .select({
      name: containers.name,
      parentId: containers.parentId,
      description: containers.description,
    })
    .from(containers)
    .where(and(eq(containers.id, containerId), eq(containers.ownerId, ownerId)));
  return found;
}

/** The album's value for the field now: undefined when the field isn't applied, null when applied-empty. */
export async function fieldValueBase(
  db: Database,
  { albumId, fieldId }: { albumId: string; fieldId: string },
): Promise<FieldValueData | undefined> {
  const values = await readSnapshot(db, (tx) => valuesOfAlbums(tx, [albumId]));
  return values.find((value) => value.fieldId === fieldId)?.value;
}

/** The album's link for `service` now, null without one. */
export async function linkBase(
  db: Database,
  { albumId, service }: { albumId: string; service: StreamingService },
): Promise<string | null> {
  const [found] = await db
    .select({ url: albumServiceLinks.url })
    .from(albumServiceLinks)
    .where(and(eq(albumServiceLinks.albumId, albumId), eq(albumServiceLinks.service, service)));
  return found?.url ?? null;
}

/** The person's choices for a view now, each null when not made (FR-11.7). */
export async function viewPrefsBase(
  db: Database,
  { personId, viewKey }: { personId: string; viewKey: string },
): Promise<ViewPrefsFields> {
  const [found] = await db
    .select({
      sortMode: viewPrefs.sortMode,
      sortDir: viewPrefs.sortDir,
      grouped: viewPrefs.grouped,
      layout: viewPrefs.layout,
    })
    .from(viewPrefs)
    .where(and(eq(viewPrefs.personId, personId), eq(viewPrefs.viewKey, viewKey)));
  return found ?? { sortMode: null, sortDir: null, grouped: null, layout: null };
}

/**
 * What a view holds now, in the person's manual order, with their keys there (TS-16): the root's or a folder's
 * folders and lists, a list's albums, or Unsorted. Undefined for a folder or list they can't read.
 */
export async function viewSequence(
  db: Database,
  { personId, viewKey, limit }: { personId: string; viewKey: string; limit: number },
): Promise<{ ids: string[]; keys: Map<string, string> } | undefined> {
  let ids: string[];
  if (viewKey === "unsorted") {
    ids = (await unsortedPage(db, { ownerId: personId, offset: 0, limit })).items.map(
      (album) => album.id,
    );
  } else {
    const page = await containerPage(db, {
      readerId: personId,
      ...(viewKey === "root" ? {} : { containerId: viewKey }),
      offset: 0,
      limit,
    });
    if (page.kind === "missing") return undefined;
    ids = page.page.items.map((item) => item.id);
  }
  const rows = await db
    .select({ itemId: positions.itemId, key: positions.key })
    .from(positions)
    .where(and(eq(positions.personId, personId), eq(positions.viewKey, viewKey)));
  return { ids, keys: new Map(rows.map((row) => [row.itemId, row.key])) };
}
