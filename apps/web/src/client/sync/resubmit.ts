// Making a write's change again (DS-80, DS-84): **Retry** for a failure, **Apply mine** for a conflict, and a batch
// report's Retry and Retry all. The change goes through its collection like any edit, so it shows at once, is
// tracked, and takes its `base` from the record as it is now (TS-21). That is what resubmitting "against the current
// value" means: a conflict's attempt is applied over the newer value only because the person chose it (FR-09.4).
// Several writes are made again with one collection call per collection and operation, so a prerequisite and the
// writes that build on it travel in one batch, with their dependencies declared (FR-13.4). The old writes are
// dismissed once their changes are made again or turn out to be made already.

import {
  albumFields,
  membershipKey,
  type Album,
  type Container,
  type Membership,
  type Mutation,
} from "@tonaris/domain";

import type { SyncClient } from "./client";
import type { SaveState } from "./writer";

/**
 * `sent`: the change went out as a new write. `unchanged`: the records already hold it, so nothing was sent.
 * `gone`: the record it changes no longer exists.
 */
export type Resubmitted = "sent" | "unchanged" | "gone";

type Collections = Pick<SyncClient, "albums" | "containers" | "memberships">;

type Call =
  | "album.insert"
  | "album.update"
  | "container.insert"
  | "container.update"
  | "entry.insert"
  | "entry.delete";

/** The collection calls that make the changes again, in the order of each call's first change. */
function plan() {
  const order: Call[] = [];
  return {
    order,
    albumInserts: [] as Album[],
    albumUpdates: new Map<string, Partial<Album>>(),
    containerInserts: [] as Container[],
    containerUpdates: new Map<string, Partial<Container>>(),
    entryInserts: [] as Membership[],
    entryDeletes: [] as string[],
    /** Notes that `call` is needed; answers `sent`. */
    needs(call: Call): "sent" {
      if (!order.includes(call)) order.push(call);
      return "sent";
    },
  };
}

type Plan = ReturnType<typeof plan>;

/** Makes `state`'s change again through its collection, and dismisses `state` unless the record is gone. */
export function resubmit(
  client: Collections & Pick<SyncClient, "states">,
  state: SaveState,
): Resubmitted {
  return resubmitAll(client, [state])[0] ?? "unchanged";
}

/**
 * Makes the changes of `states` again, in their order, with one collection call per collection and operation; each
 * one not gone is dismissed. Answers each one's result, in order.
 */
export function resubmitAll(
  client: Collections & Pick<SyncClient, "states">,
  states: readonly SaveState[],
): Resubmitted[] {
  const planned = plan();
  const results = states.map((state) => remake(client, state.mutation, planned));
  for (const call of planned.order) make(client, planned, call);
  for (const [index, state] of states.entries()) {
    if (results[index] !== "gone") client.states.dismiss(state.mutation.mutationId);
  }
  return results;
}

/** Adds `mutation`'s change to `planned`, unless the records already hold it or its record is gone. */
function remake(
  { albums, containers, memberships }: Collections,
  mutation: Mutation,
  planned: Plan,
): Resubmitted {
  if (mutation.name === "album.create") {
    if (albums.has(mutation.args.id)) return "unchanged";
    planned.albumInserts.push(mutation.args);
    return planned.needs("album.insert");
  }
  if (mutation.name === "album.update") {
    const { id, ...attempted } = mutation.args;
    const current = albums.get(id);
    if (!current) return "gone";
    const changes: Partial<Album> = {};
    for (const field of albumFields) {
      if (attempted[field] !== undefined && attempted[field] !== current[field]) {
        Object.assign(changes, { [field]: attempted[field] });
      }
    }
    if (Object.keys(changes).length === 0) return "unchanged";
    planned.albumUpdates.set(id, { ...planned.albumUpdates.get(id), ...changes });
    return planned.needs("album.update");
  }
  if (mutation.name === "container.create") {
    if (containers.has(mutation.args.id)) return "unchanged";
    planned.containerInserts.push(mutation.args);
    return planned.needs("container.insert");
  }
  if (mutation.name === "container.rename" || mutation.name === "container.move") {
    const { args } = mutation;
    const current = containers.get(args.id);
    if (!current) return "gone";
    let change: Partial<Container>;
    if ("name" in args) {
      if (current.name === args.name) return "unchanged";
      change = { name: args.name };
    } else {
      if (current.parentId === args.parentId) return "unchanged";
      change = { parentId: args.parentId };
    }
    planned.containerUpdates.set(args.id, { ...planned.containerUpdates.get(args.id), ...change });
    return planned.needs("container.update");
  }
  const { listId, albumId } = mutation.args;
  const key = membershipKey(listId, albumId);
  if (mutation.name === "membership.add") {
    if (memberships.has(key)) return "unchanged";
    planned.entryInserts.push({ listId, albumId, addedAt: new Date().toISOString() });
    return planned.needs("entry.insert");
  }
  if (!memberships.has(key)) return "unchanged";
  planned.entryDeletes.push(key);
  return planned.needs("entry.delete");
}

/** Sets each row's planned changes on its draft; the drafts come in the order of the keys. */
function applyTo<Row>(rows: Map<string, Partial<Row>>) {
  return (drafts: Row[]) => {
    for (const [index, changes] of [...rows.values()].entries()) {
      const draft = drafts[index];
      if (draft) Object.assign(draft, changes);
    }
  };
}

/** Makes one call: one transaction, so one batch when it holds several changes. */
function make({ albums, containers, memberships }: Collections, planned: Plan, call: Call): void {
  if (call === "album.insert") sent(albums.insert(planned.albumInserts));
  else if (call === "album.update") {
    sent(albums.update([...planned.albumUpdates.keys()], applyTo(planned.albumUpdates)));
  } else if (call === "container.insert") sent(containers.insert(planned.containerInserts));
  else if (call === "container.update") {
    sent(
      containers.update([...planned.containerUpdates.keys()], applyTo(planned.containerUpdates)),
    );
  } else if (call === "entry.insert") sent(memberships.insert(planned.entryInserts));
  else sent(memberships.delete(planned.entryDeletes));
}

/** The new writes report their own outcomes in the save states; a rejection is expected there, not here. */
function sent(transaction: { isPersisted: { promise: Promise<unknown> } }): void {
  transaction.isPersisted.promise.catch(() => {});
}
