// A shared folder's or list's content (DS-70, DS-72; FR-07.11, FR-06.5), as guests and signed-in viewers see it:
// breadcrumbs inside the share, a folder's folders and lists, and a list's albums as rows or a grid, each with an Open
// chooser of its services (DS-25), whose web links leave with no referrer (TS-32). The page around it says where a folder or list
// opens and how the view is sorted. A signed-in viewer's folders and lists, and in manual order their album rows' Move
// buttons, also move with ⌥↑ and ⌥↓, ⇧ for the ends (DS-49), in the viewer's own arrangement.

import { Artwork, artworkSrc } from "@/features/collection/artwork";
import { ContainerIcon } from "@/features/collection/icons";
import { chronology, groupNames, type Direction, type Section } from "@/features/collection/order";
import { ServiceChoices } from "@/features/open/service-choices";
import { ChevronRight, ExternalLink, GripVertical } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { Album, Container, SharedSnapshot } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@tonaris/ui/components/popover";
import { cn } from "@tonaris/ui/lib/utils";

export type SharedAlbum = SharedSnapshot["albums"][number];

/** A link to a folder or list inside the share, with the anchor's props. */
export type LinkTo = (
  id: string,
  props: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode },
) => ReactNode;

/** Moves an item in the person's own arrangement; answers whether it moved. */
export type Mover = (id: string, to: Direction) => boolean;

/** The list's albums, in the order they were added, oldest first: manual order's fallback (DS-44). */
export function albumsIn(snapshot: SharedSnapshot, listId: string): SharedAlbum[] {
  const byId = new Map(snapshot.albums.map((album) => [album.id, album]));
  return snapshot.memberships
    .filter((entry) => entry.listId === listId)
    .toSorted(
      (a, b) =>
        (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0) ||
        (a.albumId < b.albumId ? -1 : a.albumId > b.albumId ? 1 : 0),
    )
    .flatMap((entry) => byId.get(entry.albumId) ?? []);
}

/** Each album's service links. */
export function linksByAlbum(snapshot: SharedSnapshot): Map<string, SharedSnapshot["links"]> {
  const links = new Map<string, SharedSnapshot["links"]>();
  for (const link of snapshot.links) {
    links.set(link.albumId, [...(links.get(link.albumId) ?? []), link]);
  }
  return links;
}

/** The move a key asks for: ⌥↑ and ⌥↓, with ⇧ for the ends. */
function directionOf(event: KeyboardEvent): Direction | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey) return undefined;
  if (event.key === "ArrowUp") return event.shiftKey ? "top" : "up";
  if (event.key === "ArrowDown") return event.shiftKey ? "bottom" : "down";
  return undefined;
}

const rowOf = (element: HTMLElement) => element.closest("li") ?? element;
const placeOf = (element: HTMLElement) => {
  const row = rowOf(element);
  return [...(row.parentElement?.children ?? [])].indexOf(row);
};

/**
 * The key handler for a movable row. Drawing a row at its new place can take the focus from it, so the focus follows
 * it there, before the browser paints.
 */
function useMoveKeys(onMove: Mover | undefined) {
  const moving = useRef<{ element: HTMLElement; from: number }>(undefined);
  useLayoutEffect(() => {
    const move = moving.current;
    if (!move || placeOf(move.element) === move.from) return;
    moving.current = undefined;
    if (move.element.isConnected && document.activeElement !== move.element) move.element.focus();
  });
  if (!onMove) return undefined;
  return (id: string) => (event: KeyboardEvent<HTMLElement>) => {
    const to = directionOf(event);
    if (!to) return;
    event.preventDefault();
    const element = event.currentTarget;
    if (onMove(id, to)) moving.current = { element, from: placeOf(element) };
  };
}

export function ShareBreadcrumbs({ path, linkTo }: { path: readonly Container[]; linkTo: LinkTo }) {
  if (path.length === 0) return null;
  return (
    <nav aria-label="Breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1 text-small text-fg-secondary">
        {path.map((folder) => (
          <li key={folder.id} className="flex items-center gap-1">
            {linkTo(folder.id, { className: "hover:text-fg-primary", children: folder.name })}
            <ChevronRight aria-hidden strokeWidth={1.5} className="size-3.5" />
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A folder's folders and lists, in the order given. */
export function FolderItems({
  folder,
  items,
  linkTo,
  onMove,
}: {
  folder: Container;
  items: readonly Container[];
  linkTo: LinkTo;
  onMove?: Mover | undefined;
}) {
  const keysFor = useMoveKeys(onMove);
  if (items.length === 0) return <p className="text-fg-secondary">This folder is empty.</p>;
  return (
    <ul aria-label={`In ${folder.name}`} className="flex max-w-3xl flex-col">
      {items.map((child) => (
        <li key={child.id}>
          {linkTo(child.id, {
            className:
              "flex h-14 items-center gap-3 rounded-md px-2 text-fg-primary hover:bg-hover md:h-9",
            onKeyDown: keysFor?.(child.id),
            "aria-keyshortcuts": keysFor ? "Alt+ArrowUp Alt+ArrowDown" : undefined,
            children: (
              <>
                <ContainerIcon kind={child.kind} />
                <span className="truncate">{child.name}</span>
              </>
            ),
          })}
        </li>
      ))}
    </ul>
  );
}

/** A list's albums, in sections when grouped, as rows or a grid. */
export function AlbumSections({
  list,
  parts,
  linksOf,
  layout,
  onMove,
}: {
  list: Container;
  parts: readonly Section<SharedAlbum>[];
  linksOf: ReadonlyMap<string, SharedSnapshot["links"]>;
  layout: "rows" | "grid";
  onMove?: Mover | undefined;
}) {
  const keysFor = useMoveKeys(layout === "rows" ? onMove : undefined);
  if (parts.every((part) => part.albums.length === 0)) {
    return <p className="text-fg-secondary">This list is empty.</p>;
  }
  return parts.map(({ group, albums }) => (
    <section key={group ?? "all"} aria-label={group ? groupNames[group] : "Albums"}>
      {group && (
        <h2 className="mb-2 text-small font-medium text-fg-tertiary">{groupNames[group]}</h2>
      )}
      <ul
        // Rows and the grid never share list items: WebKit keeps the height a row remembered for
        // `content-visibility`, which squashed the grid's cards (TON-126).
        key={layout}
        aria-label={group ? groupNames[group] : `Albums in ${list.name}`}
        className={cn(
          layout === "grid"
            ? "grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4"
            : "flex max-w-4xl flex-col",
        )}
      >
        {albums.map((album) => (
          <AlbumItem
            key={album.id}
            album={album}
            links={linksOf.get(album.id) ?? []}
            layout={layout}
            onKeyDown={keysFor?.(album.id)}
          />
        ))}
      </ul>
    </section>
  ));
}

function AlbumItem({
  album,
  links,
  layout,
  onKeyDown,
}: {
  album: SharedAlbum;
  links: SharedSnapshot["links"];
  layout: "rows" | "grid";
  /** Given, the row has a Move button, which moves it with ⌥↑ and ⌥↓. */
  onKeyDown?: ((event: KeyboardEvent<HTMLElement>) => void) | undefined;
}) {
  const { year, recorded } = chronology(album);
  const shown = `${recorded ? "rec. " : ""}${year}`;
  if (layout === "grid") {
    return (
      <li className="flex flex-col gap-1.5 [contain-intrinsic-size:auto_14rem] [content-visibility:auto]">
        <Artwork
          title={album.title}
          src={artworkSrc(album)}
          className="w-full"
          letterClassName="text-display"
        />
        <span className="truncate text-fg-primary">{album.title}</span>
        <span className="truncate text-small text-fg-secondary">
          {album.artistCredit} · {shown}
        </span>
        <OpenIn album={album} links={links} />
      </li>
    );
  }
  return (
    <li className="flex h-14 items-center gap-3 border-b border-subtle px-2 [contain-intrinsic-size:auto_3.5rem] [content-visibility:auto] md:h-11">
      {onKeyDown && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${album.title}`}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Shift+ArrowUp Alt+Shift+ArrowDown"
          title="⌥↑ or ⌥↓ moves it; with ⇧, to the top or bottom"
          className="-ml-1 hidden text-fg-tertiary md:inline-flex"
          onKeyDown={onKeyDown}
        >
          <GripVertical aria-hidden strokeWidth={1.5} />
        </Button>
      )}
      <Artwork
        title={album.title}
        src={artworkSrc(album)}
        className="size-11 md:size-7"
        letterClassName="text-small"
      />
      <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-3">
        <span className="truncate text-fg-primary md:flex-1">{album.title}</span>
        <span className="truncate text-small text-fg-secondary md:w-1/3 md:text-base">
          {album.artistCredit}
        </span>
      </span>
      <span className="hidden w-16 shrink-0 text-fg-secondary tabular-nums md:block">{shown}</span>
      <OpenIn album={album} links={links} />
    </li>
  );
}

/** The service chooser (DS-25, FR-06.5): the album's services, each opening its app on desktop or its page. */
function OpenIn({ album, links }: { album: Album; links: SharedSnapshot["links"] }) {
  const [open, setOpen] = useState(false);
  if (links.length === 0) return <span className="w-14 shrink-0" />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" aria-label={`Open ${album.title} in…`} />}
      >
        <ExternalLink strokeWidth={1.5} aria-hidden />
        Open
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2">
        <ServiceChoices title={album.title} links={links} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
