// List entries as clients hold them (TS-11, TS-24), and the commands that add and remove them (TON-27). An album
// is one record however many lists hold it, at most once each (FR-01.6, FR-01.7), and it stays in the collection
// when its entries go (FR-01.8). In no active list, it is in Unsorted: a query, never anything stored (TS-13). The
// owner's arrangement follows (DS-51): an album entering Unsorted goes to its top, and one leaving Unsorted or a list
// loses its place there, so a new entry lands at the end of the list.

import { applied, contentAccess, isFailure, type ContentAccess } from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { maxMemberships } from "./limits";
import { failure, type Failure } from "./outcomes";
import { forgetPlace, placeAtTop } from "./positions";
import { actingUserId } from "./principals";
import type { MembershipAddResult } from "./sync";
import { z } from "./zod";

/** An album's entry in a list (FR-01.6). `addedAt` orders entries that have no manual position (TS-16). */
export const membershipSchema = z
  .object({ listId: z.uuid(), albumId: z.uuid(), addedAt: z.iso.datetime() })
  .meta({ description: "An album's entry in a list (FR-01.6)." });
export type Membership = z.infer<typeof membershipSchema>;

/** An entry's key in the change log and on clients: the list's ID and the album's, joined by a colon. */
export function membershipKey(listId: string, albumId: string): string {
  return `${listId}:${albumId}`;
}

type EntryArgs = { listId: string; albumId: string };

/**
 * The active list `listId`, with how the principal may change its entries, or why not (TS-30): the owner's, or one
 * shared with them to edit (FR-07.19). A missing list and one they don't know of are `not_found`. Adding to a list and
 * taking from it, captures and new albums included, ask this.
 */
export async function changeableList(
  listId: string,
  context: CommandContext,
): Promise<(StoredContainer & { access: ContentAccess }) | Failure> {
  const list = await context.store.findContainer(listId);
  const missing = "This list doesn't exist.";
  if (!list) return failure("not_found", missing);
  const access = await contentAccess(context, list, {
    refusal: "You can't change this list.",
    missing,
    what: "this list",
  });
  if (isFailure(access)) return access;
  if (list.kind !== "list") {
    return failure("invalid_destination", "Folders don't hold albums. Choose a list.");
  }
  if (list.trashed) return failure("trashed", "This list is in Trash. Recover it to change it.");
  return { ...list, access };
}

/** The refusal of an entry past the account's limit (TS-18): a list entry added, or a capture's. */
export function membershipLimitProblem(): Failure {
  return failure(
    "limit_exceeded",
    `You've reached ${maxMemberships.toLocaleString("en")} list entries (including Trash). Remove albums from lists, or permanently delete lists from Trash, to add more.`,
  );
}

/**
 * Whether the person sees the album in someone else's collection: it is in an active list they may read. An editor
 * adds to a list only albums they see, so no other album of the owner's is reached by its ID (FR-07.20).
 */
async function seesAlbum(context: CommandContext, userId: string, albumId: string) {
  for (const { listId } of await context.store.entriesOfAlbum(albumId)) {
    // oxlint-disable-next-line no-await-in-loop
    const list = await context.store.findContainer(listId);
    // oxlint-disable-next-line no-await-in-loop
    if (list && !list.trashed && (await context.store.canReadShared(userId, listId))) return true;
  }
  return false;
}

/**
 * The owner of the active list and album an entry joins, or why they can't have one. Another person's album and
 * a missing one get the same answer, so nobody can probe for other people's IDs; an editor's, too, for an album of
 * the owner's they don't see, unless it is `anyAlbum`: one a capture or a new album command already chose.
 */
async function entryOwner(
  { listId, albumId }: EntryArgs,
  context: CommandContext,
  { anyAlbum = false }: { anyAlbum?: boolean } = {},
): Promise<string | Failure> {
  const list = await changeableList(listId, context);
  if (isFailure(list)) return list;
  const album = await context.store.findAlbum(albumId);
  const unknown = failure("not_found", "This album isn't in your collection.");
  if (!album || album.ownerId !== list.ownerId) return unknown;
  const userId = actingUserId(context.principal);
  if (!anyAlbum && userId !== undefined && userId !== album.ownerId) {
    if (!(await seesAlbum(context, userId, albumId))) return unknown;
  }
  if (album.trashed) {
    return failure("trashed", "This album is in Trash. Recover it to put it in lists.");
  }
  return list.ownerId;
}

/**
 * Puts an album in a list (FR-01.6): the owner's, or an editor's in a share (FR-07.19). One already there keeps its
 * entry and the time it was added, and is reported as already in the list (FR-01.7). The new entry's time is the
 * server's, one clock for every session. `anyAlbum` is for a capture's or a new album's own entry.
 */
export async function addMembership(
  args: EntryArgs,
  context: CommandContext,
  options: { anyAlbum?: boolean } = {},
): Promise<CommandResult> {
  const ownerId = await entryOwner(args, context, options);
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  if (await store.findMembership(args.listId, args.albumId)) {
    const result: MembershipAddResult = { alreadyInList: true };
    return { status: "applied", changes: [], result };
  }
  if ((await store.countMemberships(ownerId)) >= maxMemberships) return membershipLimitProblem();

  const membership: Membership = {
    listId: args.listId,
    albumId: args.albumId,
    addedAt: (context.now ?? new Date()).toISOString(),
  };
  const wasUnsorted = !(await store.inActiveList(args.albumId));
  await store.insertMembership({ ...membership, ownerId });
  const result: MembershipAddResult = { alreadyInList: false };
  return {
    status: "applied",
    changes: [
      {
        entity: "membership",
        id: membershipKey(args.listId, args.albumId),
        op: "insert",
        data: membership,
      },
      // It leaves Unsorted, and its place there isn't kept (DS-51).
      ...(wasUnsorted ? await forgetPlace(store, ownerId, "unsorted", args.albumId) : []),
    ],
    result,
  };
}

/**
 * Takes an album out of a list. The album and its other entries stay (FR-01.8); in no list, it is in Unsorted.
 * An entry that isn't there is already gone, so removing it changes nothing.
 */
export async function removeMembership(
  args: EntryArgs,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = await entryOwner(args, context);
  if (isFailure(ownerId)) return ownerId;
  const { store } = context;
  if (!(await store.findMembership(args.listId, args.albumId))) return applied();

  await store.deleteMembership(args.listId, args.albumId);
  const id = membershipKey(args.listId, args.albumId);
  const left = await forgetPlace(store, ownerId, args.listId, args.albumId);
  // In no list any more, it enters Unsorted, at the top (DS-51).
  const entered = (await store.inActiveList(args.albumId))
    ? []
    : [await placeAtTop(store, ownerId, "unsorted", args.albumId)];
  return applied({ entity: "membership", id, op: "delete", data: null }, ...left, ...entered);
}
