// List entries as clients hold them (TS-11, TS-24), and the commands that add and remove them (TON-27). An album
// is one record however many lists hold it, at most once each (FR-01.6, FR-01.7), and it stays in the collection
// when its entries go (FR-01.8). In no active list, it is in Unsorted: a query, never anything stored (TS-13). The
// owner's arrangement follows (DS-51): an album entering Unsorted goes to its top, and one leaving Unsorted or a list
// loses its place there, so a new entry lands at the end of the list.

import { applied, isFailure } from "./command-kit";
import type { CommandContext, CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { maxMemberships } from "./limits";
import { failure, type Failure } from "./outcomes";
import { authorizeWrite } from "./policies";
import { forgetPlace, placeAtTop } from "./positions";
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
 * The active list `listId`, if the principal may change its entries, or why not: a missing list is `not_found`, and
 * someone else's gets the policy's code (TS-30). Adding to a list and taking from it, captures included, ask this.
 */
export async function changeableList(
  listId: string,
  { principal, store }: CommandContext,
): Promise<StoredContainer | Failure> {
  const list = await store.findContainer(listId);
  if (!list) return failure("not_found", "This list doesn't exist.");
  const decision = authorizeWrite(principal, { ownerId: list.ownerId, scope: "collection" });
  if (!decision.allowed) return failure(decision.code, "You can't change this list.");
  if (list.kind !== "list") {
    return failure("invalid_destination", "Folders don't hold albums. Choose a list.");
  }
  if (list.trashed) return failure("trashed", "This list is in Trash. Recover it to change it.");
  return list;
}

/** The refusal of an entry past the account's limit (TS-18): a list entry added, or a capture's. */
export function membershipLimitProblem(): Failure {
  return failure(
    "limit_exceeded",
    `You've reached ${maxMemberships.toLocaleString("en")} list entries (including Trash). Remove albums from lists, or permanently delete lists from Trash, to add more.`,
  );
}

/**
 * The owner of the active list and album an entry joins, or why they can't have one. Another person's album and
 * a missing one get the same answer, so nobody can probe for other people's IDs.
 */
async function entryOwner(
  { listId, albumId }: EntryArgs,
  context: CommandContext,
): Promise<string | Failure> {
  const list = await changeableList(listId, context);
  if (isFailure(list)) return list;
  const album = await context.store.findAlbum(albumId);
  if (!album || album.ownerId !== list.ownerId) {
    return failure("not_found", "This album isn't in your collection.");
  }
  if (album.trashed) {
    return failure("trashed", "This album is in Trash. Recover it to put it in lists.");
  }
  return list.ownerId;
}

/**
 * Puts an album in a list (FR-01.6). One already there keeps its entry and the time it was added, and is
 * reported as already in the list (FR-01.7). The new entry's time is the server's, one clock for every session.
 */
export async function addMembership(
  args: EntryArgs,
  context: CommandContext,
): Promise<CommandResult> {
  const ownerId = await entryOwner(args, context);
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
