// What MCP's write tools need from storage (TS-22, TS-63): an agent's idempotency key, claimed for the batch it names;
// the owner's values a change is based on when the agent didn't send them (TS-21), read as the store reads them; and
// a view's manual sequence, which a move is planned against (TS-16).

import { and, eq } from "drizzle-orm";

import type {
  FieldValueData,
  StoredField,
  StreamingService,
  ViewPrefsFields,
} from "@tonaris/domain";

import { readSnapshot, type Database } from "./client";
import { findFieldIn } from "./field-values";
import { viewItemIds } from "./mcp-reads";
import { mcpOperations, positions } from "./schema";
import { findAlbumIn, findServiceLinkIn } from "./store/albums";
import { findContainerIn } from "./store/containers";
import { findFieldValueIn } from "./store/fields";
import { findViewPrefsIn } from "./store/views";

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
  const found = await findAlbumIn(db, albumId);
  if (found?.ownerId !== ownerId) return undefined;
  const { ownerId: _owner, trashed: _trashed, ...album } = found;
  return album;
}

/** The owner's folder's or list's values now, for a change's `base`. */
export async function containerBase(
  db: Database,
  { ownerId, containerId }: { ownerId: string; containerId: string },
) {
  const found = await findContainerIn(db, containerId);
  if (found?.ownerId !== ownerId) return undefined;
  return { name: found.name, parentId: found.parentId, description: found.description };
}

/** The owner's field, with its options in order, for a change's `base`. */
export async function fieldBase(
  db: Database,
  { ownerId, fieldId }: { ownerId: string; fieldId: string },
): Promise<StoredField | undefined> {
  const found = await findFieldIn(db, fieldId);
  return found?.ownerId === ownerId ? found : undefined;
}

/**
 * The owner's album's value for the field now: undefined when the field isn't applied, null when applied-empty, and
 * undefined for an album that isn't theirs.
 */
export function fieldValueBase(
  db: Database,
  { ownerId, albumId, fieldId }: { ownerId: string; albumId: string; fieldId: string },
): Promise<FieldValueData | undefined> {
  return readSnapshot(db, async (tx) =>
    (await findAlbumIn(tx, albumId))?.ownerId === ownerId
      ? findFieldValueIn(tx, albumId, fieldId)
      : undefined,
  );
}

/** The owner's album's link for `service` now, null without one, or for an album that isn't theirs. */
export function linkBase(
  db: Database,
  { ownerId, albumId, service }: { ownerId: string; albumId: string; service: StreamingService },
): Promise<string | null> {
  return readSnapshot(db, async (tx) =>
    (await findAlbumIn(tx, albumId))?.ownerId === ownerId
      ? ((await findServiceLinkIn(tx, albumId, service))?.url ?? null)
      : null,
  );
}

/** The person's choices for a view now, each null when not made (FR-11.7). */
export async function viewPrefsBase(
  db: Database,
  { personId, viewKey }: { personId: string; viewKey: string },
): Promise<ViewPrefsFields> {
  const found = await findViewPrefsIn(db, personId, viewKey);
  if (!found) return { sortMode: null, sortDir: null, grouped: null, layout: null };
  return {
    sortMode: found.sortMode,
    sortDir: found.sortDir,
    grouped: found.grouped,
    layout: found.layout,
  };
}

/**
 * What a view holds now, in the person's manual order, with their keys there (TS-16): the root's or a folder's
 * folders and lists, a list's albums, or Unsorted, by ID only, from one snapshot. Undefined for a folder or list they
 * can't read.
 */
export function viewSequence(
  db: Database,
  { personId, viewKey, limit }: { personId: string; viewKey: string; limit: number },
): Promise<{ ids: string[]; keys: Map<string, string> } | undefined> {
  return readSnapshot(db, async (tx) => {
    const ids = await viewItemIds(tx, { readerId: personId, viewKey, limit });
    if (!ids) return undefined;
    const rows = await tx
      .select({ itemId: positions.itemId, key: positions.key })
      .from(positions)
      .where(and(eq(positions.personId, personId), eq(positions.viewKey, viewKey)));
    return { ids, keys: new Map(rows.map((row) => [row.itemId, row.key])) };
  });
}
