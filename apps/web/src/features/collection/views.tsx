// The collection views (DS-30, DS-32, DS-40, DS-49, DS-105; FR-01.3, FR-05): each view's header (breadcrumbs, its
// name as the heading and in the page title, and View options) over what it holds, or its empty state with one way
// forward. Folders and the root show their folders and lists as rows, in the view's sort; lists and Unsorted their
// albums as rows or cards, sorted and grouped as the person chose (FR-05.1, FR-05.7). Manual order is the person's
// arrangement (TS-16, TON-36), then DS-44's fallback for the rest: a list's albums in the order they were added,
// Unsorted's newest first (DS-51). A folder link that names a list leads to the list, and the other way round; a
// folder or list that doesn't exist says so, once the collection has loaded.

import { useCapture } from "@/features/capture/capture-context";
import { CaptureRows } from "@/features/capture/capture-rows";
import { PhoneShared } from "@/features/sharing/phone-shared";
import { useSharedEntries } from "@/features/sharing/shared-entries";
import { phoneRootTab } from "@/features/shell/device";
import { PageHeader, useDocumentTitle } from "@/features/shell/page-header";
import { useShell } from "@/features/shell/shell-context";
import { useConnection } from "@/features/sync/sync-provider";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Inbox, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { Album, Container, ContainerKind, Membership } from "@tonaris/domain";
import { Button, buttonVariants } from "@tonaris/ui/components/button";
import { SegmentedControl } from "@tonaris/ui/components/segmented-control";
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@tonaris/ui/components/tooltip";

import { useNarrowScreen } from "../shell/media";
import { AlbumCards } from "./album-cards";
import { AlbumDetails } from "./album-details";
import { AlbumRows } from "./album-rows";
import { useCollectionUi, useMode, useStartEditor } from "./collection-ui";
import { ContainerDescription } from "./container-description";
import { ContainerRows } from "./container-rows";
import { useCollectionData } from "./data";
import { useDeleteContainer } from "./delete-containers";
import { useDropHandler } from "./drag";
import { useCollapsedGroups } from "./groups";
import { ModeSwitch } from "./mode-switch";
import { sections, sortAlbums, type Direction } from "./order";
import { ancestorsOf } from "./tree";
import { usePresentation } from "./use-presentation";
import { useRearrange, type ViewMoves } from "./use-rearrange";
import { ViewOptions } from "./view-options";

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
  const { presentation, choose } = usePresentation(viewKey, "containers");
  const { editing } = useMode();
  const rearrange = useRearrange(viewKey, {
    manual: presentation.sortMode === "manual",
    toManual: () => choose({ sortMode: "manual" }),
  });
  // The tree holds them in the view's order already: under Manual, the arrangement.
  const moves = useMemo<ViewMoves>(() => {
    const sequence = containers.map((container) => container.id);
    const nameOf = (id: string) => tree.byId.get(id)?.name ?? "the folder or list";
    return {
      manual: rearrange.manual,
      handles: rearrange.manual && editing,
      move: (id: string, to: Direction) => rearrange.move(sequence, sequence, id, to, nameOf(id)),
      drop: (id, place) => rearrange.drop(sequence, sequence, id, place, nameOf(id)),
    };
  }, [containers, tree, rearrange, editing]);
  useDropHandler(viewKey, moves.drop);
  return (
    <ContainerRows
      containers={containers}
      label={label}
      viewKey={viewKey}
      albumCounts={counts}
      childCounts={(folderId) => tree.children.get(folderId)?.length ?? 0}
      showCreated={presentation.sortMode === "created"}
      moves={moves}
    />
  );
}

/** A list's albums in the order they were added, oldest first: the fallback manual order arranges (DS-44). */
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

/** Unsorted's albums newest first, an inbox: the fallback manual order arranges (DS-51). UUIDv7 IDs hold when. */
function newestFirst(albums: readonly Album[]): Album[] {
  return albums.toSorted((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/**
 * A list's or Unsorted's albums, as rows or cards (DS-21, DS-22, DS-40), sorted and grouped as the view's
 * presentation says (FR-05.1, FR-05.7, FR-05.8), and rearranged under Manual (DS-49). `albums` come in the view's
 * fallback order, which Manual arranges by the person's keys (TS-16).
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
  const { keys } = useCollectionData();
  const { presentation, choose } = usePresentation(viewKey, "albums");
  const { editing } = useMode();
  const { sortMode, sortDir, grouped, layout } = presentation;
  const viewKeys = keys.get(viewKey);
  const manualOrder = useMemo(
    () => sortAlbums(albums, { mode: "manual", dir: sortDir }, viewKeys),
    [albums, sortDir, viewKeys],
  );
  const shown = useMemo(
    () =>
      sections(
        sortMode === "manual" ? manualOrder : sortAlbums(albums, { mode: sortMode, dir: sortDir }),
        grouped,
      ),
    [albums, manualOrder, sortMode, sortDir, grouped],
  );
  const rearrange = useRearrange(viewKey, {
    manual: sortMode === "manual",
    toManual: () => choose({ sortMode: "manual" }),
  });
  const moves = useMemo<ViewMoves>(() => {
    const sequence = manualOrder.map((album) => album.id);
    // Grouped, an album moves among its group's albums, in the one arrangement (FR-05.8).
    const groupOf = (id: string) =>
      (shown.find((section) => section.albums.some((album) => album.id === id))?.albums ?? []).map(
        (album) => album.id,
      );
    const nameOf = (id: string) =>
      manualOrder.find((album) => album.id === id)?.title ?? "the album";
    return {
      manual: rearrange.manual,
      handles: rearrange.manual && editing,
      move: (id, to) => rearrange.move(sequence, groupOf(id), id, to, nameOf(id)),
      drop: (id, place) => rearrange.drop(sequence, groupOf(id), id, place, nameOf(id)),
    };
  }, [manualOrder, shown, rearrange, editing]);
  useDropHandler(viewKey, moves.drop);
  const [collapsed, toggle] = useCollapsedGroups(viewKey);
  const props = { sections: shown, label, viewKey, collapsed, onToggle: toggle, moves };
  return layout === "grid" ? <AlbumCards {...props} /> : <AlbumRows {...props} />;
}

/**
 * A collection view's header: its path and name, the mode toggle with Editing's tint (DS-45), and View options
 * (DS-49).
 */
function ViewHeader({
  title,
  breadcrumbs,
  back,
  viewKey,
  kind,
  container,
  viewOptions = true,
}: {
  title: string;
  breadcrumbs?: ReactNode[];
  /** Where a phone's Back goes (DS-110). */
  back?: { to: string; label: string };
  viewKey: string;
  kind: "albums" | "containers";
  /** Whether it offers View options; a phone's Shared has none (TON-134). */
  viewOptions?: boolean;
  /** The folder or list on view, which Editing mode can delete (DS-50). */
  container?: { id: string; kind: "folder" | "list" };
}) {
  const { editing } = useMode();
  const deleteContainer = useDeleteContainer();
  const { startShare } = useCollectionUi();
  const { runCommand } = useShell();
  const narrow = useNarrowScreen();
  const offline = useConnection() === "offline";
  return (
    <PageHeader
      title={title}
      breadcrumbs={breadcrumbs}
      back={back}
      editing={editing}
      actions={
        <>
          {/* Sharing is the owner's, on the desktop (DS-65); it waits while offline. */}
          {container && !narrow && (
            <Button
              variant="ghost"
              aria-keyshortcuts="Shift+S"
              disabled={offline}
              onClick={() => startShare(container.id)}
            >
              <Share2 strokeWidth={1.5} aria-hidden />
              Share
            </Button>
          )}
          {/* Rename opens the name's editor in the sidebar, as F2 does (TON-117); it waits while offline. */}
          {editing && container && (
            <Button
              variant="ghost"
              disabled={offline}
              onClick={() => runCommand("rename", { container: container.id })}
            >
              <Pencil strokeWidth={1.5} aria-hidden />
              Rename
            </Button>
          )}
          {editing && container && (
            <Button variant="ghost" onClick={() => deleteContainer(container.id)}>
              <Trash2 strokeWidth={1.5} aria-hidden />
              {container.kind === "folder" ? "Delete folder" : "Delete list"}
            </Button>
          )}
          <ModeSwitch />
          {viewOptions && <ViewOptions key={viewKey} viewKey={viewKey} kind={kind} />}
        </>
      }
    />
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

/**
 * Opens the capture dialog for the list on view (DS-48), with manual entry one step further, and C in its tooltip
 * (TON-122); disabled offline.
 */
function AddAlbumButton({ variant }: { variant: "primary" | "ghost" }) {
  const capture = useCapture();
  if (useConnection() === "offline") {
    return (
      <Tooltip>
        <TooltipTrigger render={<Button variant={variant} aria-disabled />}>
          <Plus strokeWidth={1.5} aria-hidden />
          Add album
        </TooltipTrigger>
        <TooltipContent>You're offline</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant={variant} aria-keyshortcuts="C" />}
        onClick={() => capture?.openDialog()}
      >
        <Plus strokeWidth={1.5} aria-hidden />
        Add album
      </TooltipTrigger>
      <TooltipContent>
        Add album<TooltipShortcut>C</TooltipShortcut>
      </TooltipContent>
    </Tooltip>
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

/** The collection's back, for a phone's Back (DS-110). */
const toCollection = { to: "/c", label: "Collection" };

/**
 * A phone's root screen ends with Unsorted, which the sidebar holds on a wider screen (DS-110); Shared with me is
 * the switch's other side (TON-134). Trash stays on the desktop.
 */
function PhoneRootLinks() {
  const { unsortedAlbums } = useCollectionData();
  const row =
    "flex min-h-12 items-center gap-2.5 rounded-md px-2 text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus";
  return (
    <nav aria-label="More" className="shrink-0 border-t border-subtle px-4 py-2">
      <Link to="/unsorted" className={row}>
        <Inbox strokeWidth={1.5} aria-hidden className="size-4 text-fg-secondary" />
        <span className="flex-1">Unsorted</span>
        <span className="text-fg-tertiary tabular-nums">{unsortedAlbums.length}</span>
      </Link>
    </nav>
  );
}

/**
 * A phone's Collection screen switches between the person's own folders and lists and those shared with them
 * (TON-134): `?show=shared`, or else the side last chosen on the device.
 */
function usePhoneTab(): ["mine" | "shared", (tab: "mine" | "shared") => void] {
  const { accountId } = useCollectionUi();
  const show = useSearch({ from: "/_workspace/c", select: (search) => search.show });
  const navigate = useNavigate();
  // Kept in state too: going from a remembered Shared to Mine leaves the URL as it was.
  const [remembered, setRemembered] = useState(() => phoneRootTab.read(accountId));
  const tab = show ?? remembered;
  const choose = (next: "mine" | "shared") => {
    phoneRootTab.write(accountId, next);
    setRemembered(next);
    void navigate({
      to: "/c",
      search: next === "shared" ? { show: "shared" } : {},
      replace: true,
    });
  };
  return [tab, choose];
}

function PhoneSwitch({
  tab,
  onChange,
}: {
  tab: "mine" | "shared";
  onChange: (tab: "mine" | "shared") => void;
}) {
  const shared = useSharedEntries().entries?.length ?? 0;
  return (
    <div className="shrink-0 px-4 pt-3">
      <SegmentedControl
        aria-label="Show"
        size="touch"
        value={tab}
        onValueChange={onChange}
        options={[
          { value: "mine", label: "Mine" },
          { value: "shared", label: shared > 0 ? `Shared · ${shared}` : "Shared" },
        ]}
      />
    </div>
  );
}

export function RootView() {
  const { tree, ready } = useCollectionData();
  const narrow = useNarrowScreen();
  const [tab, setTab] = usePhoneTab();
  useDocumentTitle("Collection");
  const count = tree.roots.length;
  const shared = narrow && tab === "shared";
  return (
    <>
      <ViewHeader title="Collection" viewKey="root" kind="containers" viewOptions={!shared} />
      {narrow && ready && <PhoneSwitch tab={tab} onChange={setTab} />}
      {shared ? (
        <PhoneShared />
      ) : !ready ? null : count > 0 ? (
        <ContainersBody containers={tree.roots} label="Collection" viewKey="root" />
      ) : (
        <Empty
          text="Start your collection — paste an album link or create a list."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <NewListButton parentId={null} />
              {/* The first run's second way in (DS-105): an AI client adds albums through MCP. */}
              <Link to="/settings/connections" className={buttonVariants({ variant: "ghost" })}>
                Connect an AI assistant
              </Link>
            </div>
          }
        />
      )}
      {narrow && ready && !shared && <PhoneRootLinks />}
    </>
  );
}

const kindNames: Record<ContainerKind, string> = { folder: "Folder", list: "List" };

export function ContainerView({ id, kind }: { id: string; kind: ContainerKind }) {
  const { tree, ready, albumsById, entriesByList } = useCollectionData();
  const { editing } = useMode();
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

  const ancestors = ancestorsOf(tree, id);
  const parent = ancestors.at(-1);
  const back = parent ? { to: `/f/${parent.id}`, label: parent.name } : toCollection;
  const breadcrumbs = [
    <Link key="root" to="/c" className="hover:text-fg-primary">
      Collection
    </Link>,
    ...ancestors.map((folder) => (
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
    // Adding: below the rows in Editing mode, and as the empty list's action (DS-47, DS-48). Captures under way
    // wait at the top (DS-48).
    body = (
      <>
        <CaptureRows listId={id} />
        {albums.length > 0 ? (
          <>
            <AlbumsBody albums={albums} label={container.name} viewKey={id} />
            {editing && (
              <div className="shrink-0 border-t border-subtle px-4 py-2">
                <AddAlbumButton variant="ghost" />
              </div>
            )}
          </>
        ) : (
          <Empty
            text="No albums yet. Paste a Spotify, Apple Music, Qobuz, Tidal or YouTube Music link."
            action={<AddAlbumButton variant="primary" />}
          />
        )}
      </>
    );
  }

  return (
    <>
      <ViewHeader
        title={container.name}
        breadcrumbs={breadcrumbs}
        back={back}
        viewKey={id}
        kind={container.kind === "folder" ? "containers" : "albums"}
        container={container}
      />
      <ContainerDescription container={container} />
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
      <ViewHeader title="Unsorted" back={toCollection} viewKey="unsorted" kind="albums" />
      <CaptureRows listId={null} />
      {!ready ? null : albums.length > 0 ? (
        <AlbumsBody albums={albums} label="Unsorted" viewKey="unsorted" />
      ) : (
        <Empty text="Albums that aren't in any list show up here." />
      )}
    </>
  );
}

/** An album on its own page (DS-32): `/a/{albumId}`, its details as the inspector shows them. */
export function AlbumView({ id }: { id: string }) {
  const { ready, albumsById } = useCollectionData();
  const { editing } = useMode();
  const album = albumsById.get(id);
  useDocumentTitle(album?.title ?? (ready ? "Not available" : "Album"));
  if (!album) {
    if (!ready) return <PageHeader title="Album" />;
    return (
      <>
        <PageHeader title="Not available" />
        <Body>
          <p className="text-fg-secondary">This album isn't available.</p>
          <Link to="/c" className="text-accent-solid underline-offset-4 hover:underline">
            Go to your collection
          </Link>
        </Body>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={album.title}
        back={toCollection}
        editing={editing}
        actions={<ModeSwitch />}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-xl">
          <AlbumDetails album={album} />
        </div>
      </div>
    </>
  );
}
