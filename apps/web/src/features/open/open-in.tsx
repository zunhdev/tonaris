// The "Open in…" chooser (DS-25; FR-06.5, FR-06.6, TS-43): the services an album has links for, in their order, by
// name. The person chooses one every time: nothing is preselected or remembered, and a single link is still a choice.
// On desktop, a popover: "Open in Spotify" opens the canonical page in a new tab, and "App" beside it the desktop app,
// through the scheme the spike of 28 October 2026 found. If the page keeps the focus 2 s after "App", the app may not
// be installed, so the chooser says so and offers that service's web page; it never switches service. On a phone, a
// bottom sheet of the canonical links, which the services' universal and app links hand to the installed app.

import { useNarrowScreen } from "@/features/collection/collection-ui";
import { useCollectionData } from "@/features/collection/data";
import { useNotify } from "@/features/sync/notify";
import { useSyncClient } from "@/features/sync/sync-provider";
import { ExternalLink } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  serviceNames,
  streamingServices,
  type ServiceLink,
  type StreamingService,
} from "@tonaris/domain";
import { Button, buttonVariants } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
} from "@tonaris/ui/components/popover";

import { appLink } from "./app-links";

/** How long the page may keep the focus after "App" before the chooser says the app may not have opened. */
export const appOpenWaitMs = 2_000;

type Opening = { albumId: string; anchor: Element | null };

type OpenIn = {
  /** Opens the chooser for the album, by `anchor` on desktop; says so instead when it has no links. */
  show: (albumId: string, anchor: Element | null) => void;
};

const OpenInContext = createContext<OpenIn | undefined>(undefined);

export function useOpenIn(): OpenIn | undefined {
  return useContext(OpenInContext);
}

/** The album's links, in the services' order (DS-25). */
function ordered(links: readonly ServiceLink[] | undefined): ServiceLink[] {
  return streamingServices.flatMap(
    (service) => links?.find((link) => link.service === service) ?? [],
  );
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
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="flex h-11 items-center justify-between rounded-md border border-subtle px-3 text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
                >
                  Open in {serviceNames[link.service]}
                  <ExternalLink aria-hidden strokeWidth={1.5} className="size-4" />
                </a>
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
        <DesktopChoices title={title} links={links} onClose={onClose} />
      </PopoverContent>
    </Popover>
  );
}

function DesktopChoices({
  title,
  links,
  onClose,
}: {
  title: string;
  links: readonly ServiceLink[];
  onClose: () => void;
}) {
  // The service whose app was asked for, and hasn't taken the focus.
  const [unopened, setUnopened] = useState<StreamingService>();
  const first = useRef<HTMLAnchorElement>(null);
  const waiting = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    first.current?.focus();
    return () => clearTimeout(waiting.current);
  }, []);

  /** After "App": the chooser closes when the app takes the focus, else it says the app may not have opened. */
  function watchApp(service: StreamingService) {
    clearTimeout(waiting.current);
    const tookFocus = () => {
      clearTimeout(waiting.current);
      onClose();
    };
    window.addEventListener("blur", tookFocus, { once: true });
    waiting.current = setTimeout(() => {
      window.removeEventListener("blur", tookFocus);
      if (document.hasFocus()) setUnopened(service);
      else onClose();
    }, appOpenWaitMs);
  }

  const unopenedLink = links.find((link) => link.service === unopened);
  if (unopenedLink) {
    const name = serviceNames[unopenedLink.service];
    return (
      <>
        <PopoverTitle className="text-body font-medium">Open in…</PopoverTitle>
        <output className="block text-small text-fg-secondary">
          If the {name} app didn't open, it may not be installed on this computer.
        </output>
        <div className="flex gap-2">
          <a
            href={unopenedLink.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Open {name} on the web
          </a>
          <Button size="sm" variant="ghost" onClick={() => setUnopened(undefined)}>
            Back
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PopoverTitle className="text-body font-medium">Open in…</PopoverTitle>
      <PopoverDescription className="truncate text-small">{title}</PopoverDescription>
      <ul className="flex flex-col gap-1">
        {links.map((link, index) => {
          const name = serviceNames[link.service];
          const app = appLink(link.url);
          return (
            <li key={link.service} className="flex items-center gap-1">
              <a
                ref={index === 0 ? first : undefined}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
              >
                Open in {name}
                <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5 text-fg-tertiary" />
              </a>
              {app !== undefined && (
                <a
                  href={app}
                  aria-label={`Open in the ${name} app`}
                  onClick={() => watchApp(link.service)}
                  className="flex h-8 items-center rounded-md px-2 text-small text-fg-secondary outline-none hover:bg-hover hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
                >
                  App
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
