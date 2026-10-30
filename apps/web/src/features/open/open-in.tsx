// The "Open in…" chooser (DS-25; FR-06.5, FR-06.6, TS-43): the services an album has links for, in their order, by
// name. The person chooses one every time: nothing is preselected or remembered, and a single link is still a choice.
// On a wider screen, a popover of `ServiceChoices`; on a phone, a bottom sheet. Each choice opens where the person's
// link setting says: the service's page, whose universal links hand it to an installed app on a phone, or the app
// itself (TON-104).

import { useNarrowScreen } from "@/features/collection/collection-ui";
import { useCollectionData } from "@/features/collection/data";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { ExternalLink } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { serviceNames } from "@tonaris/domain";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Popover, PopoverContent } from "@tonaris/ui/components/popover";

import { ServiceAnchor } from "./service-anchor";
import { ordered, ServiceChoices } from "./service-choices";

type Opening = { albumId: string; anchor: Element | null };

type OpenIn = {
  /** Opens the chooser for the album, by `anchor` on desktop; says so instead when it has no links. */
  show: (albumId: string, anchor: Element | null) => void;
};

const OpenInContext = createContext<OpenIn | undefined>(undefined);

export function useOpenIn(): OpenIn | undefined {
  return useContext(OpenInContext);
}

export function OpenInProvider({ children }: { children: ReactNode }) {
  const client = useSyncClient();
  const notify = useNotify();
  const [opening, setOpening] = useState<Opening>();
  const show = useCallback(
    (albumId: string, anchor: Element | null) => {
      const hasLinks = [...(client?.links.values() ?? [])].some((link) => link.albumId === albumId);
      if (!hasLinks) {
        const title = client?.albums.get(albumId)?.title ?? "This album";
        notify?.info(`'${title}' has no links to open.`);
        return;
      }
      setOpening({ albumId, anchor });
    },
    [client, notify],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <OpenInContext value={value}>
      {children}
      {opening && (
        <OpenInChooser
          key={opening.albumId}
          opening={opening}
          onClose={() => setOpening(undefined)}
        />
      )}
    </OpenInContext>
  );
}

function OpenInChooser({ opening, onClose }: { opening: Opening; onClose: () => void }) {
  const { albumsById, linksByAlbum } = useCollectionData();
  const narrow = useNarrowScreen();
  const links = ordered(linksByAlbum.get(opening.albumId));
  const title = albumsById.get(opening.albumId)?.title ?? "";
  if (links.length === 0) return null;

  if (narrow) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none">
          <DialogHeader>
            <DialogTitle>Open in…</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.service}>
                <ServiceAnchor
                  link={link}
                  onClick={onClose}
                  className="flex h-11 items-center justify-between rounded-md border border-subtle px-3 text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
                >
                  Open in {serviceNames[link.service]}
                  <ExternalLink aria-hidden strokeWidth={1.5} className="size-4" />
                </ServiceAnchor>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverContent
        anchor={opening.anchor ?? undefined}
        align="end"
        className="flex w-72 flex-col gap-2"
      >
        <ServiceChoices title={title} links={links} onClose={onClose} />
      </PopoverContent>
    </Popover>
  );
}
