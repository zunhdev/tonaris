// An album dropped on a list in the sidebar (DS-49, TON-229): it joins that list and stays where it was, announced as
// "Add to list…" announces it (DS-83). Dropped with ⌥ from a list, it moves: out of that list, into the other, with
// Undo, as taking it out of a list offers (DS-50). The sidebar is the person's own collection, so the writes are its.

import { sent } from "@/client/sync/writer";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useOwnSyncClient } from "@/features/sync/sync-provider";
import { useCallback } from "react";

import { membershipKey } from "@tonaris/domain";

/** The time an entry is made; the server records its own (TON-27). */
const now = () => new Date().toISOString();

/** Puts `album` in `list`; with `movingFrom`, the list it leaves. */
export function useDropOnList(): (
  album: { id: string; title: string },
  list: { id: string; name: string },
  movingFrom: string | undefined,
) => void {
  const client = useOwnSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  return useCallback(
    (album, list, movingFrom) => {
      if (!client) return;
      const add = (listId: string) =>
        sent(client.memberships.insert({ listId, albumId: album.id, addedAt: now() }));
      const remove = (listId: string) =>
        sent(client.memberships.delete(membershipKey(listId, album.id)));
      add(list.id);
      if (movingFrom === undefined) {
        announce(`Added ${album.title} to ${list.name}`);
        return;
      }
      remove(movingFrom);
      announce(`Moved ${album.title} to ${list.name}`);
      notify?.undo({
        title: `Moved to ${list.name}`,
        onUndo: () => {
          remove(list.id);
          add(movingFrom);
        },
      });
    },
    [client, notify, announce],
  );
}
