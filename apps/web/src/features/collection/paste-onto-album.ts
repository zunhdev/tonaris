// ⌘V onto the album open in the inspector (TON-160, DS-46): the paste capture would make a new album of (DS-48) goes
// to the open album's links instead, each in its service's row, as `pastedLinks` plans it. Adding links is an edit,
// so it switches to Editing first and waits while offline (DS-45, DS-81). It says what it did, with Undo (DS-50); a
// refused paste says why, and sends nothing.

import { setLink } from "@/client/sync/links";
import { sent } from "@/client/sync/writer";
import { useAnnounce } from "@/features/sync/announcer";
import { useNotify } from "@/features/sync/notify";
import { useConnection, useSyncClient } from "@/features/sync/sync-provider";
import { useCallback } from "react";

import { serviceLinkKey } from "@tonaris/domain";

import { useMode } from "./collection-mode";
import { useCollectionData } from "./data";
import { useInspector } from "./inspector-state";
import { pastedLinks, savedTitle } from "./pasted-links";

/**
 * Pastes `links`, the paste's lines that look like links, onto the album open in the inspector; answers whether one
 * is open, so the paste was the album's rather than a capture's.
 */
export function usePasteOntoAlbum(): (links: readonly string[]) => boolean {
  const client = useSyncClient();
  const notify = useNotify();
  const announce = useAnnounce();
  const { enterEditing } = useMode();
  const offline = useConnection() === "offline";
  const { albumId } = useInspector();
  const { albumsById, linksByAlbum } = useCollectionData();

  return useCallback(
    (links) => {
      // The owner's own albums, which are the ones they edit.
      const album = albumId === undefined ? undefined : albumsById.get(albumId);
      if (!album) return false;
      if (offline) {
        notify?.info("You're offline. Changes can wait until the connection is back.");
        return true;
      }
      const plan = pastedLinks(links, linksByAlbum.get(album.id) ?? []);
      if (plan.kind !== "save") {
        notify?.info(plan.reason);
        return true;
      }
      if (!client) return true;
      enterEditing();
      for (const { service, url } of plan.links)
        sent(setLink(client.links, { albumId: album.id, service, url }));
      const title = savedTitle(plan.links);
      announce(`${title} of ${album.title}`);
      notify?.undo({
        title,
        onUndo: () => {
          for (const { service, replaces } of plan.links) {
            if (replaces)
              sent(setLink(client.links, { albumId: album.id, service, url: replaces.url }));
            else sent(client.links.delete(serviceLinkKey(album.id, service)));
          }
        },
      });
      return true;
    },
    [albumId, albumsById, linksByAlbum, offline, client, notify, announce, enterEditing],
  );
}
