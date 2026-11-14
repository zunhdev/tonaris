// Taking albums out of a list (DS-50): the inspector's chip × and ⌫ in a list (TON-228) take one, the selection
// (TON-231) several, in one batch. The albums stay in the collection; a toast offers Undo, and the change is
// announced (DS-83).

import { sent } from "@/client/sync/writer";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useCallback } from "react";

import { membershipKey } from "@tonaris/domain";

type Named = { id: string; title: string };

/** Removes `albums`, one or several, from the list `list`, with Undo. */
export function useRemoveFromList(): (
  albums: Named | readonly Named[],
  list: { id: string; name: string },
) => void {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  return useCallback(
    (albums, list) => {
      const each: readonly Named[] = "id" in albums ? [albums] : albums;
      const [first] = each;
      if (!client || !first) return;
      // One write for all of them: the outbox sends several as one batch (TS-25).
      sent(client.memberships.delete(each.map((album) => membershipKey(list.id, album.id))));
      const one = each.length === 1;
      announce(
        one
          ? `Removed ${first.title} from ${list.name}`
          : `Removed ${each.length} albums from ${list.name}`,
      );
      notify?.undo({
        title: one
          ? `Removed from ${list.name}`
          : `${each.length} albums removed from ${list.name}`,
        onUndo: () => {
          const addedAt = new Date().toISOString();
          sent(
            client.memberships.insert(
              each.map((album) => ({ listId: list.id, albumId: album.id, addedAt })),
            ),
          );
        },
      });
    },
    [client, notify, announce],
  );
}
