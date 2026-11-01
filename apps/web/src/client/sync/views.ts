// A person's view choices and account defaults (TS-24, FR-11.7, FR-11.8): TanStack DB collections filled from the
// bootstrap and the stream, so a choice made on one device reaches the others live. Writes are optimistic, as for
// content: each becomes a `view.set` or `defaults.set` whose `base` holds the values before it, null for a choice
// not made (TS-21, FR-09.4). The link setting rides on the defaults' row, and is sent as its own
// `defaults.setLinkTarget` (FR-06.6, TON-104). A view's choices are tracked under their own save-state key, so a list's row never
// shows the state of its view options.

import {
  sameServices,
  unsetView,
  viewDefaultsFields,
  viewPrefsFields,
  type AccountDefaults,
  type Mutation,
  type ViewPrefs,
  type ViewPrefsFields,
} from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";
import { diffFields, envelope, pick } from "./writes";

/** Where the save states keep a view's choices: never a folder's or list's own key. */
const viewStateKey = ({ key }: { key: string }) => `view:${key}`;

/** The defaults' one row, and its save-state key. */
export const defaultsKey = "defaults";

/**
 * The `view.set` that takes a view's choices from `before` to `next`, or none if they are the same. The sort is one
 * choice, so its mode and direction go together even when only one changed.
 */
function viewWrite(before: ViewPrefs, next: Partial<ViewPrefsFields>): Mutation[] {
  const changed = diffFields(viewPrefsFields, before, next);
  if (!changed) return [];
  const { args, base } = changed;
  if ((args.sortMode === undefined) !== (args.sortDir === undefined)) {
    // Null clears a choice, so the half left out keeps its value.
    const other = args.sortMode === undefined ? "sortMode" : "sortDir";
    Object.assign(args, { [other]: before[other] });
    Object.assign(base, { [other]: before[other] });
  }
  return [envelope("view.set", { ...args, viewKey: before.viewKey }, base)];
}

export function createViewCollection({ engine, writer }: { engine: SyncEngine; writer: Writer }) {
  return snapshotCollection({
    engine,
    id: "views",
    entity: "view",
    rows: (s) => s.views,
    getKey: (view) => view.viewKey,
    handlers: {
      // A view's choices only, whatever else the draft carried.
      onInsert: ({ transaction }) =>
        writer.persistEach(
          transaction,
          ({ key, modified }) => viewWrite(unsetView(key), pick(modified, viewPrefsFields)),
          viewStateKey,
        ),
      onUpdate: ({ transaction }) =>
        writer.persistEach(
          transaction,
          ({ original, changes }) => viewWrite(original, changes),
          viewStateKey,
        ),
      // Forgetting a view clears each choice back to the defaults.
      onDelete: ({ transaction }) =>
        writer.persistEach(
          transaction,
          ({ key, original }) => viewWrite(original, unsetView(key)),
          viewStateKey,
        ),
    },
  });
}

/**
 * The writes that take the defaults from `before` to `next`: a `defaults.set` for the view options, a
 * `defaults.setLinkTarget` for the link setting, and a `defaults.setHiddenServices` for the services turned off
 * (TON-138); none if they are the same. The services are compared as the server compares them, in any order.
 */
export function defaultsWrites(
  before: AccountDefaults,
  next: Partial<AccountDefaults>,
): Mutation[] {
  const writes: Mutation[] = [];
  const presentation = diffFields(viewDefaultsFields, before, next);
  if (presentation) writes.push(envelope("defaults.set", presentation.args, presentation.base));
  if (next.linkTarget !== undefined && next.linkTarget !== before.linkTarget) {
    writes.push(
      envelope(
        "defaults.setLinkTarget",
        { linkTarget: next.linkTarget },
        { linkTarget: before.linkTarget },
      ),
    );
  }
  if (
    next.hiddenServices !== undefined &&
    !sameServices(next.hiddenServices, before.hiddenServices)
  ) {
    writes.push(
      envelope(
        "defaults.setHiddenServices",
        { hiddenServices: next.hiddenServices },
        { hiddenServices: before.hiddenServices },
      ),
    );
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
  return snapshotCollection({
    engine,
    id: "defaults",
    entity: "defaults",
    rows: (s) => [s.defaults],
    getKey: () => defaultsKey,
    // A change names the account; the collection holds its one row.
    keyOfChange: () => defaultsKey,
    handlers: {
      onUpdate: ({ transaction }) =>
        writer.persistEach(transaction, ({ original, changes }) =>
          defaultsWrites(original, changes),
        ),
    },
  });
}
