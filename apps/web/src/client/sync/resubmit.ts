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
  type CaptureArgs,
  type CustomField,
  positionKey,
  serviceLinkKey,
  unsetView,
  viewDefaultsFields,
  viewPrefsFields,
  type Album,
  type Container,
  type Membership,
  type Mutation,
  type ServiceLink,
  type ViewDefaults,
  type ViewPrefs,
} from "@tonaris/domain";

import type { SyncClient } from "./client";
import { defaultsKey } from "./views";
import type { SaveState } from "./writer";

/**
 * `sent`: the change went out as a new write. `unchanged`: the records already hold it, so nothing was sent.
 * `gone`: the record it changes no longer exists.
 */
export type Resubmitted = "sent" | "unchanged" | "gone";

type Collections = Pick<
  SyncClient,
  | "albums"
  | "containers"
  | "memberships"
  | "links"
  | "fields"
  | "views"
  | "defaults"
  | "positions"
  | "arrange"
  | "captures"
>;

type Call =
  | "album.insert"
  | "album.update"
  | "container.insert"
  | "container.update"
  | "entry.insert"
  | "entry.delete"
  | "link.insert"
  | "link.update"
  | "link.delete"
  | "field.insert"
  | "field.update"
  | "view.insert"
  | "view.update"
  | "view.delete"
  | "defaults.update"
  | "order"
  | "capture";

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
    linkInserts: [] as ServiceLink[],
    linkUpdates: new Map<string, Partial<ServiceLink>>(),
    linkDeletes: [] as string[],
    fieldInserts: [] as CustomField[],
    fieldUpdates: new Map<string, Partial<CustomField>>(),
    viewInserts: [] as ViewPrefs[],
    viewUpdates: new Map<string, Partial<ViewPrefs>>(),
    viewDeletes: [] as string[],
    /** Each move made again: one transaction each, as each was one move. */
    orders: [] as { viewKey: string; keys: Map<string, string | null> }[],
    defaultsUpdate: {} as Partial<ViewDefaults>,
    /** Captures sent again: one request each, as they were (TON-45). */
    captures: [] as CaptureArgs[],
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
  { albums, containers, memberships, links, fields, views, defaults, positions }: Collections,
  mutation: Mutation,
  planned: Plan,
): Resubmitted {
  if (mutation.name === "album.create") {
    if (albums.has(mutation.args.id)) return "unchanged";
    planned.albumInserts.push({ ...mutation.args, artworkUrl: null });
    return planned.needs("album.insert");
  }
  if (mutation.name === "album.setArtwork") {
    const { id, artworkUrl } = mutation.args;
    const current = albums.get(id);
    if (!current) return "gone";
    if (current.artworkUrl === artworkUrl) return "unchanged";
    planned.albumUpdates.set(id, { ...planned.albumUpdates.get(id), artworkUrl });
    return planned.needs("album.update");
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
  if (mutation.name === "album.capture") {
    // Sent again as it was; an album saved under its ID means it was saved after all.
    if (albums.has(mutation.args.albumId)) return "unchanged";
    planned.captures.push(mutation.args);
    return planned.needs("capture");
  }
  if (mutation.name === "link.set" || mutation.name === "link.remove") {
    const { albumId, service } = mutation.args;
    if (!albums.has(albumId)) return "gone";
    const key = serviceLinkKey(albumId, service);
    const current = links.get(key);
    if (mutation.name === "link.remove") {
      if (!current) return "unchanged";
      planned.linkDeletes.push(key);
      return planned.needs("link.delete");
    }
    const { url } = mutation.args;
    if (current?.url === url) return "unchanged";
    if (!current) {
      planned.linkInserts.push({ albumId, service, url });
      return planned.needs("link.insert");
    }
    planned.linkUpdates.set(key, { url });
    return planned.needs("link.update");
  }
  if (mutation.name === "field.create") {
    if (fields.has(mutation.args.id)) return "unchanged";
    planned.fieldInserts.push(mutation.args);
    return planned.needs("field.insert");
  }
  if (mutation.name === "field.rename") {
    const current = fields.get(mutation.args.id);
    if (!current) return "gone";
    if (current.name === mutation.args.name) return "unchanged";
    planned.fieldUpdates.set(mutation.args.id, { name: mutation.args.name });
    return planned.needs("field.update");
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
  if (mutation.name === "view.set") {
    const { viewKey, ...attempted } = mutation.args;
    if (viewKey !== "root" && viewKey !== "unsorted" && !containers.has(viewKey)) return "gone";
    const saved = views.get(viewKey);
    const current = saved ?? unsetView(viewKey);
    const changes: Partial<ViewPrefs> = {};
    for (const field of viewPrefsFields) {
      if (attempted[field] !== undefined && attempted[field] !== current[field]) {
        Object.assign(changes, { [field]: attempted[field] });
      }
    }
    if (Object.keys(changes).length === 0) return "unchanged";
    const target = { ...current, ...changes };
    if (viewPrefsFields.every((field) => target[field] === null)) {
      planned.viewDeletes.push(viewKey);
      return planned.needs("view.delete");
    }
    if (!saved) {
      planned.viewInserts.push(target);
      return planned.needs("view.insert");
    }
    planned.viewUpdates.set(viewKey, { ...planned.viewUpdates.get(viewKey), ...changes });
    return planned.needs("view.update");
  }
  if (mutation.name === "defaults.set") {
    const current = defaults.get(defaultsKey);
    if (!current) return "gone";
    const changes: Partial<ViewDefaults> = {};
    for (const field of viewDefaultsFields) {
      const value = mutation.args[field];
      if (value !== undefined && value !== current[field])
        Object.assign(changes, { [field]: value });
    }
    if (Object.keys(changes).length === 0) return "unchanged";
    Object.assign(planned.defaultsUpdate, changes);
    return planned.needs("defaults.update");
  }
  if (mutation.name === "order.set") {
    const { viewKey, keys } = mutation.args;
    if (viewKey !== "root" && viewKey !== "unsorted" && !containers.has(viewKey)) return "gone";
    const changed = new Map(
      Object.entries(keys).filter(
        ([itemId, key]) => (positions.get(positionKey(viewKey, itemId))?.key ?? null) !== key,
      ),
    );
    if (changed.size === 0) return "unchanged";
    planned.orders.push({ viewKey, keys: changed });
    return planned.needs("order");
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
function make(
  {
    albums,
    containers,
    memberships,
    links,
    fields,
    views,
    defaults,
    arrange,
    captures,
  }: Collections,
  planned: Plan,
  call: Call,
): void {
  if (call === "album.insert") sent(albums.insert(planned.albumInserts));
  else if (call === "album.update") {
    sent(albums.update([...planned.albumUpdates.keys()], applyTo(planned.albumUpdates)));
  } else if (call === "container.insert") sent(containers.insert(planned.containerInserts));
  else if (call === "container.update") {
    sent(
      containers.update([...planned.containerUpdates.keys()], applyTo(planned.containerUpdates)),
    );
  } else if (call === "entry.insert") sent(memberships.insert(planned.entryInserts));
  else if (call === "entry.delete") sent(memberships.delete(planned.entryDeletes));
  else if (call === "link.insert") sent(links.insert(planned.linkInserts));
  else if (call === "field.insert") sent(fields.insert(planned.fieldInserts));
  else if (call === "field.update") {
    sent(fields.update([...planned.fieldUpdates.keys()], applyTo(planned.fieldUpdates)));
  } else if (call === "link.update") {
    sent(links.update([...planned.linkUpdates.keys()], applyTo(planned.linkUpdates)));
  } else if (call === "link.delete") sent(links.delete(planned.linkDeletes));
  else if (call === "view.insert") sent(views.insert(planned.viewInserts));
  else if (call === "view.update") {
    sent(views.update([...planned.viewUpdates.keys()], applyTo(planned.viewUpdates)));
  } else if (call === "view.delete") sent(views.delete(planned.viewDeletes));
  else if (call === "defaults.update") {
    sent(
      defaults.update(defaultsKey, (draft) => {
        Object.assign(draft, planned.defaultsUpdate);
      }),
    );
  } else if (call === "capture") captures.send(planned.captures);
  else for (const { viewKey, keys } of planned.orders) sent(arrange(viewKey, keys));
}

/** The new writes report their own outcomes in the save states; a rejection is expected there, not here. */
function sent(transaction: { isPersisted: { promise: Promise<unknown> } }): void {
  transaction.isPersisted.promise.catch(() => {});
}
