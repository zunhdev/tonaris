// Rearranging a view (FR-05.2, DS-49): a move by keyboard or a drop, planned as the keys it writes (TS-16), written
// as one `order.set` through the sync client, and announced (DS-83). Only manual order is rearranged; under another
// sort, trying offers to switch. Rearranging is presentation, not a collection edit, so it works offline too (X-04).

import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useCallback } from "react";

import { useCollectionData } from "./data";
import { placeIn, planMove, type Direction, type Place } from "./order";

const noKeys = new Map<string, string>();

/**
 * Moves within the view `viewKey`. `sequence` is the view's whole manual order by ID, and `group` the items the move
 * is among, in their order: the group's when grouped, else the same as `sequence`. Each answers whether it moved.
 */
export function useRearrange(
  viewKey: string,
  { manual, toManual }: { manual: boolean; toManual: () => void },
) {
  const client = useSyncClient();
  const { keys } = useCollectionData();
  const announce = useAnnounce();
  const notify = useNotify();

  const write = useCallback(
    (sequence: readonly string[], itemId: string, place: Place) => {
      if (!client) return;
      const writes = planMove(sequence, keys.get(viewKey) ?? noKeys, itemId, place);
      // The save-state layer reports a move that isn't saved.
      client.arrange(viewKey, writes).isPersisted.promise.catch(() => {});
    },
    [client, keys, viewKey],
  );

  /** ⌥↑ / ⌥↓, with ⇧ for the ends. */
  const move = useCallback(
    (
      sequence: readonly string[],
      group: readonly string[],
      itemId: string,
      to: Direction,
      name: string,
    ) => {
      if (!manual) {
        notify?.info("Rearranging works in manual order", undefined, {
          label: "Switch to manual order",
          onClick: toManual,
        });
        return false;
      }
      const target = placeIn(group, itemId, to);
      if (!target) return false;
      write(sequence, itemId, target.place);
      announce(`Moved ${name} to position ${target.position} of ${group.length}`);
      return true;
    },
    [manual, notify, toManual, write, announce],
  );

  /** A drop before or after another item of `group`. */
  const drop = useCallback(
    (
      sequence: readonly string[],
      group: readonly string[],
      itemId: string,
      place: { before: string } | { after: string },
      name: string,
    ) => {
      if (!manual || ("before" in place ? place.before : place.after) === itemId) return false;
      const rest = group.filter((id) => id !== itemId);
      const at = rest.indexOf("before" in place ? place.before : place.after);
      if (at === -1) return false;
      const position = "before" in place ? at + 1 : at + 2;
      if (group.indexOf(itemId) === position - 1) return false;
      write(sequence, itemId, place);
      announce(`Moved ${name} to position ${position} of ${group.length}`);
      return true;
    },
    [manual, write, announce],
  );

  return { manual, move, drop };
}

/** What a view's grid needs to rearrange its items: whether it is in manual order, and the moves themselves. */
export type ViewMoves = {
  manual: boolean;
  /** Whether rows show drag handles: in manual order, in Editing mode (DS-45). */
  handles: boolean;
  /** ⌥↑ / ⌥↓ on an item, with ⇧ for the ends; answers whether it moved. */
  move: (id: string, to: Direction) => boolean;
  /** A drop of an item before or after another; answers whether it moved. */
  drop: (id: string, place: { before: string } | { after: string }) => boolean;
};
