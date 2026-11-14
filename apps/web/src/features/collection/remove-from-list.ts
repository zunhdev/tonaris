// Taking an album out of a list (DS-50): the inspector's chip × and ⌫ in a list (TON-228) do it the same way. The
// album stays in the collection; a toast offers Undo, and the change is announced (DS-83).

import { sent } from "@/client/sync/writer";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useCallback } from "react";

import { membershipKey } from "@tonaris/domain";

/** Removes `album` from the list `listId`, named `listName`, with Undo. */
export function useRemoveFromList(): (
  album: { id: string; title: string },
  list: { id: string; name: string },
) => void {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  return useCallback(
    (album, list) => {
      if (!client) return;
      sent(client.memberships.delete(membershipKey(list.id, album.id)));
      announce(`Removed ${album.title} from ${list.name}`);
      notify?.undo({
        title: `Removed from ${list.name}`,
        onUndo: () => {
          sent(
            client.memberships.insert({
              listId: list.id,
              albumId: album.id,
              addedAt: new Date().toISOString(),
            }),
          );
        },
      });
    },
    [client, notify, announce],
  );
}
