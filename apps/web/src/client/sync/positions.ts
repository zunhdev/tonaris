// Manual order on the client (TS-16, FR-05.2): the person's positions, a TanStack DB collection filled from the
// bootstrap and the stream, and `arrange()`, which writes one move. A move may write several keys (the first move
// past unarranged items keys them too), so it is one transaction, sent as one `order.set` whose `base` holds each
// key before it (TS-21). Its rows show at once and roll back if the server refuses. It is tracked under its view's
// own save-state key, so no row's marker shows it.

import { createTransaction, type PendingMutation } from "@tanstack/db";

import { positionKey, uuidv7, type Mutation, type Position } from "@tonaris/domain";

import type { SyncEngine } from "./engine";
import { snapshotCollection } from "./snapshot";
import type { Writer } from "./writer";

/** Where the save states keep a view's moves. */
export const orderStateKey = (viewKey: string) => `order:${viewKey}`;

export function createPositionCollection({ engine }: { engine: SyncEngine }) {
  return snapshotCollection<Position>(
    engine,
    "positions",
    (s) => s.positions,
    (position) => positionKey(position.viewKey, position.itemId),
    (change) => (change.entity === "position" ? { key: change.id, row: change.data } : undefined),
    {},
  );
}

export type PositionCollection = ReturnType<typeof createPositionCollection>;

/** The `order.set` that one transaction's changes to positions in `viewKey` make. */
function orderWrite(
  viewKey: string,
  mutations: readonly PendingMutation<Position>[],
): { key: string; mutation: Mutation } {
  const keys: Record<string, string | null> = {};
  const base: Record<string, string | null> = {};
  for (const pending of mutations) {
    // A delete's `modified` is the row as it was.
    const { itemId } = pending.modified;
    keys[itemId] = pending.type === "delete" ? null : pending.modified.key;
    base[itemId] =
      pending.type === "insert" || !("key" in pending.original) ? null : pending.original.key;
  }
  return {
    key: orderStateKey(viewKey),
    mutation: { mutationId: uuidv7(), name: "order.set", args: { viewKey, keys }, base },
  };
}

/** Writes one move in `viewKey`: each item's new key, or null to clear its place. */
export function createArrange({
  positions,
  writer,
}: {
  positions: PositionCollection;
  writer: Writer;
}) {
  return (viewKey: string, keys: ReadonlyMap<string, string | null>) => {
    const transaction = createTransaction<Position>({
      mutationFn: async ({ transaction: written }) => {
        if (written.mutations.length === 0) return;
        await writer.persist(written, [orderWrite(viewKey, written.mutations)]);
      },
    });
    transaction.mutate(() => {
      for (const [itemId, key] of keys) {
        const id = positionKey(viewKey, itemId);
        const saved = positions.get(id);
        if (key === null) {
          if (saved) positions.delete(id);
        } else if (saved) {
          if (saved.key !== key) {
            positions.update(id, (draft) => {
              draft.key = key;
            });
          }
        } else positions.insert({ viewKey, itemId, key });
      }
    });
    return transaction;
  };
}
