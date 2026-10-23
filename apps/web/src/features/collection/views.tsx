// The collection views (DS-30, DS-32, DS-40, DS-49, DS-105; FR-01.3, FR-05): each view's header (breadcrumbs, its
// name as the heading and in the page title, and View options) over what it holds, or its empty state with one way
// forward. Folders and the root show their folders and lists as rows, in the view's sort; lists and Unsorted their
// albums as rows or cards, sorted and grouped as the person chose (FR-05.1, FR-05.7). Manual order is DS-44's
// fallback until TON-36: a list's albums in the order they were added, Unsorted's newest first (DS-51). A folder link
// that names a list leads to the list, and the other way round; a folder or list that doesn't exist says so, once
// the collection has loaded.

import { PageHeader } from "@/features/shell/page-header";
import { useConnection } from "@/features/sync/sync-provider";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";

import type { Album, Container, ContainerKind, Membership } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";

import { AlbumCards } from "./album-cards";
import { AlbumRows } from "./album-rows";
import { useStartEditor } from "./collection-ui";
import { ContainerRows } from "./container-rows";
import { useCollectionData } from "./data";
import { useCollapsedGroups } from "./groups";
import { sections, sortAlbums } from "./order";
import { ancestorsOf } from "./tree";
import { usePresentation } from "./use-presentation";
import { ViewOptions } from "./view-options";

/** Names the page "{title} · Tonaris": the view's name is only in the client store, so the route can't. */
function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Tonaris`;
  }, [title]);
}

function Body({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {children}
    </div>
  );
}

/**
 * A folder's or the root's folders and lists, as rows (DS-41), in the order the tree already holds them: the view's
 * sort. Sorted by creation date, the rows show when each was created.
 */
function ContainersBody({
  containers,
  label,
  viewKey,
}: {
  containers: readonly Container[];
  label: string;
  viewKey: string;
}) {
  const { tree, counts } = useCollectionData();
  const { presentation } = usePresentation(viewKey, "containers");
  return (
    <ContainerRows
      containers={containers}
      label={label}
      albumCounts={counts}
      childCounts={(folderId) => tree.children.get(folderId)?.length ?? 0}
      showCreated={presentation.sortMode === "created"}
    />
  );
}

/** A list's albums in the order they were added, oldest first: its manual order until TON-36 (DS-44). */
function addedOrder(
  entries: readonly Membership[],
  albumsById: ReadonlyMap<string, Album>,
): Album[] {
  return entries
    .toSorted(
      (a, b) =>
        (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0) ||
        (a.albumId < b.albumId ? -1 : a.albumId > b.albumId ? 1 : 0),
    )
    .flatMap((entry) => albumsById.get(entry.albumId) ?? []);
}

/** Unsorted's albums newest first, an inbox: its manual order until TON-36 (DS-51). Their UUIDv7 IDs hold when. */
function newestFirst(albums: readonly Album[]): Album[] {
  return albums.toSorted((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/**
 * A list's or Unsorted's albums, as rows or cards (DS-21, DS-22, DS-40), sorted and grouped as the view's
 * presentation says (FR-05.1, FR-05.7, FR-05.8). `albums` come in the view's manual order.
 */
function AlbumsBody({
  albums,
  label,
  viewKey,
}: {
  albums: readonly Album[];
  label: string;
  viewKey: string;
}) {
  const { presentation } = usePresentation(viewKey, "albums");
  const { sortMode, sortDir, grouped, layout } = presentation;
  const shown = useMemo(
    () => sections(sortAlbums(albums, { mode: sortMode, dir: sortDir }), grouped),
    [albums, sortMode, sortDir, grouped],
  );
  const [collapsed, toggle] = useCollapsedGroups(viewKey);
  return layout === "grid" ? (
    <AlbumCards sections={shown} label={label} collapsed={collapsed} onToggle={toggle} />
  ) : (
    <AlbumRows sections={shown} label={label} collapsed={collapsed} onToggle={toggle} />
  );
}

/** An empty view: one sentence and at most one action (DS-105). */
function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <Body>
      <p className="max-w-sm text-fg-secondary">{text}</p>
      {action}
    </Body>
  );
}

/** Starts a new list in `parentId`, named in the sidebar; disabled offline (DS-81). */
function NewListButton({ parentId }: { parentId: string | null }) {
  const startEditor = useStartEditor();
  if (useConnection() === "offline") {
    return (
      <Tooltip>
        <TooltipTrigger render={<Button aria-disabled />}>New list</TooltipTrigger>
        <TooltipContent>You're offline</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button
      variant="primary"
      onClick={() => startEditor({ mode: "create", kind: "list", parentId, name: "" })}
    >
      New list
    </Button>
  );
}

export function RootView() {
  const { tree, ready } = useCollectionData();
  useDocumentTitle("Collection");
  const count = tree.roots.length;
  return (
    <>
      <PageHeader title="Collection" actions={<ViewOptions viewKey="root" kind="containers" />} />
      {!ready ? null : count > 0 ? (
        <ContainersBody containers={tree.roots} label="Collection" viewKey="root" />
      ) : (
        <Empty
          text="Start your collection — paste an album link or create a list."
          action={<NewListButton parentId={null} />}
        />
      )}
    </>
  );
}

const kindNames: Record<ContainerKind, string> = { folder: "Folder", list: "List" };

export function ContainerView({ id, kind }: { id: string; kind: ContainerKind }) {
  const { tree, ready, albumsById, entriesByList } = useCollectionData();
  const navigate = useNavigate();
  const container = tree.byId.get(id);
  const entries = entriesByList.get(id);
  const albums = useMemo(() => addedOrder(entries ?? [], albumsById), [entries, albumsById]);
  useDocumentTitle(container?.name ?? (ready ? "Not available" : kindNames[kind]));

  // A folder's path given a list, or a list's given a folder, leads to the right one (DS-32).
  useEffect(() => {
    if (!container || container.kind === kind) return;
    void (container.kind === "folder"
      ? navigate({ to: "/f/$folderId", params: { folderId: id }, replace: true })
      : navigate({ to: "/l/$listId", params: { listId: id }, replace: true }));
  }, [container, kind, id, navigate]);

  if (!container) {
    if (!ready) return <PageHeader title={kindNames[kind]} />;
    return (
      <>
        <PageHeader title="Not available" />
        <Body>
          <p className="text-fg-secondary">This folder or list isn't available.</p>
          <Link to="/c" className="text-accent-solid underline-offset-4 hover:underline">
            Go to your collection
          </Link>
        </Body>
      </>
    );
  }

  const breadcrumbs = [
    <Link key="root" to="/c" className="hover:text-fg-primary">
      Collection
    </Link>,
    ...ancestorsOf(tree, id).map((folder) => (
      <Link
        key={folder.id}
        to="/f/$folderId"
        params={{ folderId: folder.id }}
        className="hover:text-fg-primary"
      >
        {folder.name}
      </Link>
    )),
  ];

  let body: ReactNode;
  if (container.kind === "folder") {
    const inside = tree.children.get(id) ?? [];
    body =
      inside.length > 0 ? (
        <ContainersBody containers={inside} label={container.name} viewKey={id} />
      ) : (
        <Empty text="This folder is empty." action={<NewListButton parentId={id} />} />
      );
  } else {
    // Add album comes with capture and manual entry (M3, TON-38).
    body =
      albums.length > 0 ? (
        <AlbumsBody albums={albums} label={container.name} viewKey={id} />
      ) : (
        <Empty text="No albums yet. Paste a Spotify, Apple Music, Qobuz or Tidal link." />
      );
  }

  return (
    <>
      <PageHeader
        title={container.name}
        breadcrumbs={breadcrumbs}
        actions={
          <ViewOptions
            key={id}
            viewKey={id}
            kind={container.kind === "folder" ? "containers" : "albums"}
          />
        }
      />
      {body}
    </>
  );
}

export function UnsortedView() {
  const { unsortedAlbums, ready } = useCollectionData();
  const albums = useMemo(() => newestFirst(unsortedAlbums), [unsortedAlbums]);
  useDocumentTitle("Unsorted");
  return (
    <>
      <PageHeader title="Unsorted" actions={<ViewOptions viewKey="unsorted" kind="albums" />} />
      {!ready ? null : albums.length > 0 ? (
        <AlbumsBody albums={albums} label="Unsorted" viewKey="unsorted" />
      ) : (
        <Empty text="Albums that aren't in any list show up here." />
      )}
    </>
  );
}

/** Shared with me, until sharing arrives (M7). */
export function SharedView() {
  useDocumentTitle("Shared with me");
  return (
    <>
      <PageHeader title="Shared with me" />
      <Empty text="Collections people share with you appear here." />
    </>
  );
}

/** Trash, until deleting arrives (M5): nothing can be in it yet. */
export function TrashView() {
  useDocumentTitle("Trash");
  return (
    <>
      <PageHeader title="Trash" />
      <Empty text="Nothing in Trash. Deleted items stay here for 30 days." />
    </>
  );
}
