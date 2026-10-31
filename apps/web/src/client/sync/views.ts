// A person's view choices and account defaults (TS-24, FR-11.7, FR-11.8): TanStack DB collections filled from the
// bootstrap and the stream, so a choice made on one device reaches the others live. Writes are optimistic, as for
// content: each becomes a `view.set` or `defaults.set` whose `base` holds the values before it, null for a choice
// not made (TS-21, FR-09.4). The link setting rides on the defaults' row, and is sent as its own
// `defaults.setLinkTarget` (FR-06.6, TON-104). A view's choices are tracked under their own save-state key, so a list's row never
// shows the state of its view options.

import {
  uuidv7,
  unsetView,
  viewDefaultsFields,
  viewPrefsFields,
  type AccountDefaults,
  type Mutation,
  type ViewDefaults,
  type ViewPrefs,
  type ViewPrefsFields,
} from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

/** Where the save states keep a view's choices: never a folder's or list's own key. */
export const viewStateKey = (viewKey: string) => `view:${viewKey}`;

/** The defaults' one row, and its save-state key. */
export const defaultsKey = "defaults";

/**
 * The `view.set` that takes a view's choices from `before` to `next`, or none if they are the same. The sort is one
 * choice, so its mode and direction go together even when only one changed.
 */
export function viewWrite(
  before: ViewPrefs,
  next: Partial<ViewPrefsFields>,
): { key: string; mutation: Mutation } | undefined {
  const changed = viewPrefsFields.filter(
    (field) => next[field] !== undefined && next[field] !== before[field],
  );
  if (changed.includes("sortMode") !== changed.includes("sortDir")) {
    changed.push(changed.includes("sortMode") ? "sortDir" : "sortMode");
  }
  if (changed.length === 0) return undefined;
  const args: Partial<ViewPrefsFields> = {};
  const base: Partial<ViewPrefsFields> = {};
  for (const field of changed) {
    // Null clears a choice, so only a field left out keeps its value.
    Object.assign(args, { [field]: next[field] === undefined ? before[field] : next[field] });
    Object.assign(base, { [field]: before[field] });
  }
  return {
    key: viewStateKey(before.viewKey),
    mutation: {
      mutationId: uuidv7(),
      name: "view.set",
      args: { ...args, viewKey: before.viewKey },
      base,
    },
  };
}

/** A view's choices only, whatever else the draft carried. */
function viewOf({ viewKey, sortMode, sortDir, grouped, layout }: ViewPrefs): ViewPrefs {
  return { viewKey, sortMode, sortDir, grouped, layout };
}

export function createViewCollection({ engine, writer }: { engine: SyncEngine; writer: Writer }) {
  return snapshotCollection<ViewPrefs>(
    engine,
    "views",
    (s) => s.views,
    (view) => view.viewKey,
    (change) => (change.entity === "view" ? { key: change.id, row: change.data } : undefined),
    {
      onInsert: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.flatMap(
            (pending) => viewWrite(unsetView(pending.key), viewOf(pending.modified)) ?? [],
          ),
        ),
      onUpdate: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.flatMap(
            (pending) => viewWrite(viewOf(pending.original), pending.changes) ?? [],
          ),
        ),
      // Forgetting a view clears each choice back to the defaults.
      onDelete: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.flatMap(
            (pending) => viewWrite(viewOf(pending.original), unsetView(pending.key)) ?? [],
          ),
        ),
    },
  );
}

/**
 * The writes that take the defaults from `before` to `next`: a `defaults.set` for the view options, a
 * `defaults.setLinkTarget` for the link setting, and a `defaults.setHiddenServices` for the services turned off
 * (TON-138); none if they are the same.
 */
export function defaultsWrites(
  before: AccountDefaults,
  next: Partial<AccountDefaults>,
): { key: string; mutation: Mutation }[] {
  const writes: { key: string; mutation: Mutation }[] = [];
  const args: Partial<ViewDefaults> = {};
  const base: Partial<ViewDefaults> = {};
  for (const field of viewDefaultsFields) {
    if (next[field] === undefined || next[field] === before[field]) continue;
    Object.assign(args, { [field]: next[field] });
    Object.assign(base, { [field]: before[field] });
  }
  if (Object.keys(args).length > 0) {
    writes.push({
      key: defaultsKey,
      mutation: { mutationId: uuidv7(), name: "defaults.set", args, base },
    });
  }
  if (next.linkTarget !== undefined && next.linkTarget !== before.linkTarget) {
    writes.push({
      key: defaultsKey,
      mutation: {
        mutationId: uuidv7(),
        name: "defaults.setLinkTarget",
        args: { linkTarget: next.linkTarget },
        base: { linkTarget: before.linkTarget },
      },
    });
  }
  if (
    next.hiddenServices !== undefined &&
    next.hiddenServices.join(",") !== before.hiddenServices.join(",")
  ) {
    writes.push({
      key: defaultsKey,
      mutation: {
        mutationId: uuidv7(),
        name: "defaults.setHiddenServices",
        args: { hiddenServices: next.hiddenServices },
        base: { hiddenServices: before.hiddenServices },
      },
    });
  }
  return writes;
}

export function createDefaultsCollection({
  engine,
  writer,
}: {
  engine: SyncEngine;
  writer: Writer;
}) {
  return snapshotCollection<AccountDefaults>(
    engine,
    "defaults",
    (s) => [s.defaults],
    () => defaultsKey,
    (change) => (change.entity === "defaults" ? { key: defaultsKey, row: change.data } : undefined),
    {
      onUpdate: ({ transaction }) =>
        writer.persist(
          transaction,
          transaction.mutations.flatMap((pending) =>
            defaultsWrites(pending.original, pending.changes),
          ),
        ),
    },
  );
}
