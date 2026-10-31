// A shared link's page (DS-72; FR-07.1, FR-07.3, FR-07.11, FR-11.9, FR-06.5), rendered on the server: the Tonaris
// wordmark, the folder's or list's name, "Shared by {name}" and its description; a folder's breadcrumbs and its
// folders and lists, each opened with `?c=` inside the share; a list's albums as rows or a grid, each with an Open
// chooser of its services, whose links leave with no referrer (TS-32). View options last the visit (guest-view.ts).
// The page follows the owner's saves through the link's stream, reading the share again after each, and turns into
// DS-72's unavailable sentence once the link stops working. No search; "Sign in", the terms and the privacy notice
// at the foot (TON-131).

import { sections, sortAlbums, sortContainers } from "@/features/collection/order";
import { ancestorsOf, buildTree } from "@/features/collection/tree";
import { LegalLinks } from "@/features/legal/legal-page";
import { ClientOnly, Link } from "@tanstack/react-router";
import { useCallback, useMemo, type ReactNode } from "react";

import { unavailableLink, type Container, type SharedSnapshot } from "@tonaris/domain";
import { Wordmark } from "@tonaris/ui/components/logo";
import { SegmentedControl } from "@tonaris/ui/components/segmented-control";

import { useGuestView, type GuestView } from "./guest-view";
import { LinkBanner } from "./link-banner";
import {
  AlbumSections,
  albumsIn,
  FolderItems,
  linksByAlbum,
  ShareBreadcrumbs,
  type LinkTo,
} from "./share-content";

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
        <Wordmark />
      </header>
      {children}
      <footer className="flex gap-4 border-t border-subtle px-6 py-4 text-small">
        <a
          href="/sign-in"
          className="text-fg-secondary underline underline-offset-2 hover:text-fg-primary"
        >
          Sign in
        </a>
        <LegalLinks />
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
  const linkTo = useCallback<LinkTo>(
    (id, props) => (
      <Link
        to="/s/$token"
        params={{ token }}
        search={id === snapshot.rootId ? {} : { c: id }}
        {...props}
      />
    ),
    [token, snapshot.rootId],
  );
  const current =
    (containerId === undefined ? undefined : tree.byId.get(containerId)) ??
    tree.byId.get(snapshot.rootId);
  if (!current) return <UnavailableShare />;
  const path = ancestorsOf(tree, current.id);
  const owner = snapshot.owner.displayName ?? "a Tonaris member";

  return (
    <GuestFrame>
      <LinkBanner token={token} owner={owner} />
      <main aria-labelledby="share-title" className="flex flex-1 flex-col gap-5 px-6 py-6">
        <ShareBreadcrumbs path={path} linkTo={linkTo} />
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
          <FolderItems
            folder={current}
            // Folders first, then lists, by name: the owner's arrangement isn't shared (FR-07.17).
            items={sortContainers(tree.children.get(current.id) ?? [], {
              mode: "name",
              dir: "asc",
            })}
            linkTo={linkTo}
          />
        ) : (
          <ListContents snapshot={snapshot} list={current} view={view} setView={setView} />
        )}
      </main>
    </GuestFrame>
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
  const linksOf = useMemo(() => linksByAlbum(snapshot), [snapshot]);
  const parts = sections(
    sortAlbums(albumsIn(snapshot, list.id), { mode: view.sort, dir: view.dir }),
    view.grouped,
  );
  return (
    <>
      <div className="flex flex-col gap-2">
        {/*
         * Drawn once the page is live, which they need anyway: the server renders the defaults, not the visit's view,
         * and Base UI's hidden inputs carry style attributes the CSP refuses in server-rendered HTML (TON-126).
         */}
        <ClientOnly fallback={<div className="h-7.5" />}>
          <ViewOptions view={view} setView={setView} />
        </ClientOnly>
        <p className="text-small text-fg-tertiary">
          Your view settings aren't saved — sign in to keep them.
        </p>
      </div>
      <AlbumSections list={list} parts={parts} linksOf={linksOf} layout={view.layout} />
    </>
  );
}

function ViewOptions({
  view,
  setView,
}: {
  view: GuestView;
  setView: (change: Partial<GuestView>) => void;
}) {
  return (
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
  );
}
