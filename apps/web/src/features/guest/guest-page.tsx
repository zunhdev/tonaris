// A shared link's page (DS-72; FR-07.1, FR-07.3, FR-07.11, FR-11.9, FR-06.5), rendered on the server: the Tonaris
// wordmark, the folder's or list's name, "Shared by {name}" and its description; a folder's breadcrumbs and its
// folders and lists, each opened with `?c=` inside the share; a list's albums as rows or a grid, each with an Open
// chooser of its services, whose links leave with no referrer (TS-32). View options last the visit (guest-view.ts).
// The page follows the owner's saves through the link's stream, reading the share again after each, and turns into
// DS-72's unavailable sentence once the link stops working. No search; "Sign in" at the foot.

import { Artwork, artworkSrc } from "@/features/collection/artwork";
import { ContainerIcon } from "@/features/collection/icons";
import {
  chronology,
  groupNames,
  sections,
  sortAlbums,
  sortContainers,
} from "@/features/collection/order";
import { ancestorsOf, buildTree } from "@/features/collection/tree";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import {
  serviceNames,
  unavailableLink,
  type Album,
  type Container,
  type SharedSnapshot,
} from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@tonaris/ui/components/popover";
import { SegmentedControl } from "@tonaris/ui/components/segmented-control";
import { cn } from "@tonaris/ui/lib/utils";

import { useGuestView, type GuestView } from "./guest-view";

type SharedAlbum = SharedSnapshot["albums"][number];

/** The page for a link that doesn't work, whatever the reason (DS-72). */
export function UnavailableShare() {
  return (
    <GuestFrame>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-page text-fg-primary">Not available</h1>
        <p className="max-w-sm text-fg-secondary">{unavailableLink}</p>
      </main>
    </GuestFrame>
  );
}

/** The wordmark above and "Sign in" below, around a guest page. */
function GuestFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="px-6 pt-5">
        <span className="text-title text-fg-primary">Tonaris</span>
      </header>
      {children}
      <footer className="border-t border-subtle px-6 py-4 text-small">
        <a
          href="/sign-in"
          className="text-fg-secondary underline underline-offset-2 hover:text-fg-primary"
        >
          Sign in
        </a>
      </footer>
    </div>
  );
}

export function GuestPage({
  token,
  snapshot,
  containerId,
}: {
  token: string;
  snapshot: SharedSnapshot;
  /** The folder or list inside the share on view; the shared root when not given or not in it. */
  containerId: string | undefined;
}) {
  const [view, setView] = useGuestView(token);
  const tree = useMemo(() => buildTree(snapshot.containers), [snapshot.containers]);
  const current =
    (containerId === undefined ? undefined : tree.byId.get(containerId)) ??
    tree.byId.get(snapshot.rootId);
  if (!current) return <UnavailableShare />;
  const path = ancestorsOf(tree, current.id);
  const owner = snapshot.owner.displayName ?? "a Tonaris member";

  return (
    <GuestFrame>
      <main aria-labelledby="share-title" className="flex flex-1 flex-col gap-5 px-6 py-6">
        {path.length > 0 && (
          <nav aria-label="Breadcrumbs">
            <ol className="flex flex-wrap items-center gap-1 text-small text-fg-secondary">
              {path.map((folder) => (
                <li key={folder.id} className="flex items-center gap-1">
                  <Link
                    to="/s/$token"
                    params={{ token }}
                    search={folder.id === snapshot.rootId ? {} : { c: folder.id }}
                    className="hover:text-fg-primary"
                  >
                    {folder.name}
                  </Link>
                  <ChevronRight aria-hidden strokeWidth={1.5} className="size-3.5" />
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-col gap-1">
          <h1 id="share-title" className="text-display text-fg-primary">
            {current.name}
          </h1>
          <p className="text-fg-secondary">Shared by {owner}</p>
          {current.description && (
            <p className="max-w-2xl whitespace-pre-line text-fg-secondary">{current.description}</p>
          )}
        </div>
        {current.kind === "folder" ? (
          <FolderContents token={token} rootId={snapshot.rootId} folder={current} tree={tree} />
        ) : (
          <ListContents snapshot={snapshot} list={current} view={view} setView={setView} />
        )}
      </main>
    </GuestFrame>
  );
}

function FolderContents({
  token,
  rootId,
  folder,
  tree,
}: {
  token: string;
  rootId: string;
  folder: Container;
  tree: ReturnType<typeof buildTree>;
}) {
  // Folders first, then lists, by name: the owner's arrangement isn't shared (FR-07.17).
  const children = sortContainers(tree.children.get(folder.id) ?? [], { mode: "name", dir: "asc" });
  if (children.length === 0) return <p className="text-fg-secondary">This folder is empty.</p>;
  return (
    <ul aria-label={`In ${folder.name}`} className="flex max-w-3xl flex-col">
      {children.map((child) => (
        <li key={child.id}>
          <Link
            to="/s/$token"
            params={{ token }}
            search={child.id === rootId ? {} : { c: child.id }}
            className="flex h-14 items-center gap-3 rounded-md px-2 text-fg-primary hover:bg-hover md:h-9"
          >
            <ContainerIcon kind={child.kind} />
            <span className="truncate">{child.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListContents({
  snapshot,
  list,
  view,
  setView,
}: {
  snapshot: SharedSnapshot;
  list: Container;
  view: GuestView;
  setView: (change: Partial<GuestView>) => void;
}) {
  const albumsById = useMemo(
    () => new Map(snapshot.albums.map((album) => [album.id, album])),
    [snapshot.albums],
  );
  const linksOf = useMemo(() => {
    const links = new Map<string, SharedSnapshot["links"]>();
    for (const link of snapshot.links)
      links.set(link.albumId, [...(links.get(link.albumId) ?? []), link]);
    return links;
  }, [snapshot.links]);
  const inList = snapshot.memberships.flatMap((entry) => {
    const album = entry.listId === list.id ? albumsById.get(entry.albumId) : undefined;
    return album ? [album] : [];
  });
  const sorted = sortAlbums(inList, { mode: view.sort, dir: view.dir });
  const parts = sections(sorted, view.grouped);
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Sort"
            value={view.sort}
            onValueChange={(sort) => setView({ sort })}
            options={[
              { value: "year", label: "Year" },
              { value: "name", label: "Name" },
            ]}
          />
          <SegmentedControl
            aria-label="Direction"
            value={view.dir}
            onValueChange={(dir) => setView({ dir })}
            options={[
              { value: "asc", label: "Ascending" },
              { value: "desc", label: "Descending" },
            ]}
          />
          <SegmentedControl
            aria-label="Grouping"
            value={view.grouped ? "type" : "none"}
            onValueChange={(grouping) => setView({ grouped: grouping === "type" })}
            options={[
              { value: "none", label: "Not grouped" },
              { value: "type", label: "By type" },
            ]}
          />
          <SegmentedControl
            aria-label="Layout"
            value={view.layout}
            onValueChange={(layout) => setView({ layout })}
            options={[
              { value: "rows", label: "Rows" },
              { value: "grid", label: "Grid" },
            ]}
          />
        </div>
        <p className="text-small text-fg-tertiary">
          Your view settings aren't saved — sign in to keep them.
        </p>
      </div>
      {inList.length === 0 && <p className="text-fg-secondary">This list is empty.</p>}
      {parts.map(({ group, albums }) => (
        <section key={group ?? "all"} aria-label={group ? groupNames[group] : "Albums"}>
          {group && (
            <h2 className="mb-2 text-small font-medium text-fg-tertiary">{groupNames[group]}</h2>
          )}
          <ul
            aria-label={group ? groupNames[group] : `Albums in ${list.name}`}
            className={cn(
              view.layout === "grid"
                ? "grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4"
                : "flex max-w-4xl flex-col",
            )}
          >
            {albums.map((album) => (
              <AlbumItem
                key={album.id}
                album={album}
                links={linksOf.get(album.id) ?? []}
                layout={view.layout}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function AlbumItem({
  album,
  links,
  layout,
}: {
  album: SharedAlbum;
  links: SharedSnapshot["links"];
  layout: GuestView["layout"];
}) {
  const { year, recorded } = chronology(album);
  const shown = `${recorded ? "rec. " : ""}${year}`;
  if (layout === "grid") {
    return (
      <li className="flex flex-col gap-1.5 [content-visibility:auto]">
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

/** The service chooser (DS-25, FR-06.5): each link opens in a new tab, with no referrer, so the token stays put. */
function OpenIn({ album, links }: { album: Album; links: SharedSnapshot["links"] }) {
  if (links.length === 0) return <span className="w-14 shrink-0" />;
  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" aria-label={`Open ${album.title} in…`} />}
      >
        <ExternalLink strokeWidth={1.5} aria-hidden />
        Open
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-48 flex-col gap-0.5 p-1">
        {links.map((link) => (
          <a
            key={link.service}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 items-center rounded-md px-2 text-fg-primary hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
          >
            {serviceNames[link.service]}
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
