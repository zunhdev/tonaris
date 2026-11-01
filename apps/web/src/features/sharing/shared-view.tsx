// A folder or list shared with the person, signed in (DS-70; FR-07.11, FR-07.17, FR-05.2): the workspace shell, view
// only. The header shows "View only · Shared by {name}" and View options, with no mode toggle, Share or delete. The
// presentation is the person's own: their sort, grouping and layout for this view, from their account defaults until
// they choose, and in manual order their own arrangement, moved with ⌥↑ and ⌥↓ (DS-49). It's saved to their account
// and synced like their own views, never touching the owner's. Read from `GET /v1/shared/{id}`, again after each of
// the owner's saves (its stream), and "No longer available" once access ends. The content draws as on guest pages.

import { api } from "@/api";
import { useAlbumArrangement, useContainerArrangement } from "@/features/collection/arrangement";
import { ancestorsOf, buildTree } from "@/features/collection/tree";
import { ViewOptions } from "@/features/collection/view-options";
import {
  AlbumSections,
  albumsIn,
  FolderItems,
  linksByAlbum,
  ShareBreadcrumbs,
  type LinkTo,
} from "@/features/guest/share-content";
import { useNarrowScreen } from "@/features/shell/media";
import { PageHeader, useDocumentTitle } from "@/features/shell/page-header";
import { useKeyedRead } from "@/features/shell/use-keyed-read";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";

import type { Container, SharedSnapshot } from "@tonaris/domain";

import { useShareStream } from "./use-share-stream";

type Loaded = { snapshot: SharedSnapshot } | { snapshot: undefined; missing: true };

/** The share as the person may see it now: read when shown and again on `reread`. */
function useSharedSnapshot(rootId: string) {
  const [revision, setRevision] = useState(0);
  const reread = useCallback(() => setRevision((count) => count + 1), []);
  const loaded = useKeyedRead(`${rootId}#${revision}`, () =>
    api.v1
      .shared({ id: rootId })
      .get()
      .then(({ data, error }): Loaded | undefined => {
        if (data) return { snapshot: data };
        // Access ended, or never was: say so. Anything else keeps what's shown, until the next read.
        return error?.status === 404 ? { snapshot: undefined, missing: true } : undefined;
      }),
  )?.value;
  return { loaded, reread };
}

export function SharedView({ rootId, containerId }: { rootId: string; containerId?: string }) {
  const { loaded, reread } = useSharedSnapshot(rootId);
  useShareStream(`/v1/shared/${rootId}/stream`, loaded?.snapshot !== undefined, reread);
  if (!loaded) return <PageHeader title="Shared with me" />;
  if (!loaded.snapshot) return <NoLongerAvailable />;
  return <SharedContent snapshot={loaded.snapshot} containerId={containerId} />;
}

function NoLongerAvailable() {
  useDocumentTitle("Not available");
  return (
    <>
      <PageHeader title="Not available" />
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-fg-secondary">
          No longer available. Its owner stopped sharing it with you, or moved it to Trash.
        </p>
        <Link to="/shared" className="text-fg-primary underline underline-offset-2">
          Shared with me
        </Link>
      </div>
    </>
  );
}

function SharedContent({
  snapshot,
  containerId,
}: {
  snapshot: SharedSnapshot;
  containerId: string | undefined;
}) {
  const { rootId } = snapshot;
  const tree = useMemo(() => buildTree(snapshot.containers), [snapshot.containers]);
  const current =
    (containerId === undefined ? undefined : tree.byId.get(containerId)) ?? tree.byId.get(rootId);
  const linkTo = useCallback<LinkTo>(
    (id, props) => (
      <Link
        to="/shared/$containerId"
        params={{ containerId: rootId }}
        search={id === rootId ? {} : { c: id }}
        {...props}
      />
    ),
    [rootId],
  );
  const narrow = useNarrowScreen();
  const title = current?.name ?? "Shared with me";
  /**
   * A phone's Back (DS-110): to the folder above in the share, or from its top to the Collection screen's Shared
   * (TON-134).
   */
  const backFrom = (parentId: string | null) => {
    const parent = parentId === null ? undefined : tree.byId.get(parentId);
    if (!parent || current?.id === rootId) return { to: "/c?show=shared", label: "Collection" };
    return {
      to: parent.id === rootId ? `/shared/${rootId}` : `/shared/${rootId}?c=${parent.id}`,
      label: parent.name,
    };
  };
  useDocumentTitle(title);
  if (!current) return <NoLongerAvailable />;
  const owner = snapshot.owner.displayName ?? "a Tonaris member";
  const kind = current.kind === "folder" ? "containers" : "albums";
  return (
    <>
      <PageHeader
        title={current.name}
        breadcrumbs={[
          <Link key="shared" to="/shared" className="hover:text-fg-primary">
            Shared with me
          </Link>,
        ]}
        back={backFrom(current.parentId)}
        actions={
          <>
            {!narrow && (
              <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-subtle px-2.5 text-small text-fg-secondary">
                View only · Shared by {owner}
              </span>
            )}
            <ViewOptions key={current.id} viewKey={current.id} kind={kind} />
          </>
        }
      />
      <div className="flex flex-col gap-5 px-6 py-5">
        {/* A phone's top bar has no room for it (DS-110). */}
        {narrow && <p className="text-small text-fg-secondary">View only · Shared by {owner}</p>}
        <ShareBreadcrumbs path={ancestorsOf(tree, current.id)} linkTo={linkTo} />
        {current.description && (
          <p className="max-w-2xl whitespace-pre-line text-fg-secondary">{current.description}</p>
        )}
        {current.kind === "folder" ? (
          <FolderBody
            key={current.id}
            folder={current}
            items={tree.children.get(current.id) ?? []}
            linkTo={linkTo}
          />
        ) : (
          <ListBody key={current.id} list={current} snapshot={snapshot} />
        )}
      </div>
    </>
  );
}

/** A shared folder's folders and lists in the person's own sort (DS-41). */
function FolderBody({
  folder,
  items,
  linkTo,
}: {
  folder: Container;
  items: readonly Container[];
  linkTo: LinkTo;
}) {
  const { shown, moves } = useContainerArrangement(items, folder.id);
  return <FolderItems folder={folder} items={shown} linkTo={linkTo} onMove={moves.move} />;
}

/** A shared list's albums in the person's own sort, grouping and layout (DS-40, DS-43). */
function ListBody({ list, snapshot }: { list: Container; snapshot: SharedSnapshot }) {
  const albums = useMemo(() => albumsIn(snapshot, list.id), [snapshot, list.id]);
  const linksOf = useMemo(() => linksByAlbum(snapshot), [snapshot]);
  const { presentation, sections, manual, moves } = useAlbumArrangement(albums, list.id);
  return (
    <AlbumSections
      list={list}
      parts={sections}
      linksOf={linksOf}
      layout={presentation.layout}
      onMove={manual ? moves.move : undefined}
    />
  );
}
