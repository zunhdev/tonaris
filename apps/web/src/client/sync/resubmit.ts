// Making a write's change again (DS-80): **Retry** for a failure, **Apply mine** for a conflict. The change goes
// through its collection like any edit, so it shows at once, is tracked, and takes its `base` from the record as it
// is now (TS-21). That is what resubmitting "against the current value" means: a conflict's attempt is applied
// over the newer value only because the person chose it (FR-09.4). The old write is dismissed once its change is
// made again or turns out to be made already.

import { albumFields, membershipKey, type Mutation } from "@tonaris/domain";

import type { SyncClient } from "./client";
import type { SaveState } from "./writer";

/**
 * `sent`: the change went out as a new write. `unchanged`: the records already hold it, so nothing was sent.
 * `gone`: the record it changes no longer exists.
 */
export type Resubmitted = "sent" | "unchanged" | "gone";

type Collections = Pick<SyncClient, "albums" | "containers" | "memberships">;

/** Makes `state`'s change again through its collection, and dismisses `state` unless the record is gone. */
export function resubmit(
  client: Collections & Pick<SyncClient, "states">,
  state: SaveState,
): Resubmitted {
  const result = remake(client, state.mutation);
  if (result !== "gone") client.states.dismiss(state.mutation.mutationId);
  return result;
}

function remake({ albums, containers, memberships }: Collections, mutation: Mutation): Resubmitted {
  if (mutation.name === "album.create") {
    if (albums.has(mutation.args.id)) return "unchanged";
    return sent(albums.insert(mutation.args));
  }
  if (mutation.name === "album.update") {
    const { id, ...attempted } = mutation.args;
    const current = albums.get(id);
    if (!current) return "gone";
    const changes = albumFields.filter(
      (field) => attempted[field] !== undefined && attempted[field] !== current[field],
    );
    if (changes.length === 0) return "unchanged";
    return sent(
      albums.update(id, (draft) => {
        for (const field of changes) Object.assign(draft, { [field]: attempted[field] });
      }),
    );
  }
  if (mutation.name === "container.create") {
    if (containers.has(mutation.args.id)) return "unchanged";
    return sent(containers.insert(mutation.args));
  }
  if (mutation.name === "container.rename" || mutation.name === "container.move") {
    const { args } = mutation;
    const current = containers.get(args.id);
    if (!current) return "gone";
    const name = "name" in args ? args.name : current.name;
    const parentId = "parentId" in args ? args.parentId : current.parentId;
    if (current.name === name && current.parentId === parentId) return "unchanged";
    return sent(
      containers.update(args.id, (draft) => {
        draft.name = name;
        draft.parentId = parentId;
      }),
    );
  }
  const { listId, albumId } = mutation.args;
  const key = membershipKey(listId, albumId);
  if (mutation.name === "membership.add") {
    if (memberships.has(key)) return "unchanged";
    return sent(memberships.insert({ listId, albumId, addedAt: new Date().toISOString() }));
  }
  if (!memberships.has(key)) return "unchanged";
  return sent(memberships.delete(key));
}

/** The new write reports its own outcome in the save states; a rejection is expected there, not here. */
function sent(transaction: { isPersisted: { promise: Promise<unknown> } }): "sent" {
  transaction.isPersisted.promise.catch(() => {});
  return "sent";
}
