// A folder or list shared with the person, signed in (DS-70; FR-07.11, FR-07.17, FR-05.2): the workspace shell, view
// only. The header shows "View only · Shared by {name}" and View options, with no mode toggle, Share or delete. The
// presentation is the person's own: their sort, grouping and layout for this view, from their account defaults until
// they choose, and in manual order their own arrangement, moved with ⌥↑ and ⌥↓ (DS-49). It's saved to their account
// and synced like their own views, never touching the owner's. Read from `GET /v1/shared/{id}`, again after each of
// the owner's saves (its stream), and "No longer available" once access ends. The content draws as on guest pages.

import { api } from "@/api";
import { useCollectionData } from "@/features/collection/data";
import { sections, sortAlbums, sortContainers, type Direction } from "@/features/collection/order";
import { ancestorsOf, buildTree } from "@/features/collection/tree";
import { usePresentation } from "@/features/collection/use-presentation";
import { useRearrange } from "@/features/collection/use-rearrange";
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
import { PageHeader } from "@/features/shell/page-header";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Container, SharedSnapshot } from "@tonaris/domain";

import { useShareStream } from "./use-share-stream";

type Loaded = { snapshot: SharedSnapshot } | { snapshot: undefined; missing: true };

/** The share as the person may see it now: read when shown and again on `reread`. */
function useSharedSnapshot(rootId: string) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [revision, setRevision] = useState(0);
  const reread = useCallback(() => setRevision((count) => count + 1), []);
  useEffect(() => {
    let current = true;
    api.v1
      .shared({ id: rootId })
      .get()
      .then(
        ({ data, error }) => {
          if (!current) return revision;
          if (data) setLoaded({ snapshot: data });
          // Access ended, or never was: say so. Anything else keeps what's shown, until the next read.
          else if (error?.status === 404) setLoaded({ snapshot: undefined, missing: true });
          return revision;
        },
        () => revision,
      );
    return () => {
      current = false;
    };
  }, [rootId, revision]);
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
  useEffect(() => {
    document.title = "Not available · Tonaris";
  }, []);
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
  useEffect(() => {
    document.title = `${title} · Tonaris`;
  }, [title]);
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
  const { keys } = useCollectionData();
  const { presentation, choose } = usePresentation(folder.id, "containers");
  const { sortMode, sortDir } = presentation;
  const manualOrder = sortContainers(items, { mode: "manual", dir: sortDir }, keys.get(folder.id));
  const shown =
    sortMode === "manual" ? manualOrder : sortContainers(items, { mode: sortMode, dir: sortDir });
  const rearrange = useRearrange(folder.id, {
    manual: sortMode === "manual",
    toManual: () => choose({ sortMode: "manual" }),
  });
  const sequence = manualOrder.map((item) => item.id);
  const onMove = (id: string, to: Direction) =>
    rearrange.move(sequence, sequence, id, to, items.find((item) => item.id === id)?.name ?? "it");
  return <FolderItems folder={folder} items={shown} linkTo={linkTo} onMove={onMove} />;
}

/** A shared list's albums in the person's own sort, grouping and layout (DS-40, DS-43). */
function ListBody({ list, snapshot }: { list: Container; snapshot: SharedSnapshot }) {
  const { keys } = useCollectionData();
  const { presentation, choose } = usePresentation(list.id, "albums");
  const { sortMode, sortDir, grouped, layout } = presentation;
  const albums = useMemo(() => albumsIn(snapshot, list.id), [snapshot, list.id]);
  const linksOf = useMemo(() => linksByAlbum(snapshot), [snapshot]);
  const viewKeys = keys.get(list.id);
  const manualOrder = useMemo(
    () => sortAlbums(albums, { mode: "manual", dir: sortDir }, viewKeys),
    [albums, sortDir, viewKeys],
  );
  const parts = useMemo(
    () =>
      sections(
        sortMode === "manual" ? manualOrder : sortAlbums(albums, { mode: sortMode, dir: sortDir }),
        grouped,
      ),
    [albums, manualOrder, sortMode, sortDir, grouped],
  );
  const manual = sortMode === "manual";
  const rearrange = useRearrange(list.id, {
    manual,
    toManual: () => choose({ sortMode: "manual" }),
  });
  const onMove = (id: string, to: Direction) => {
    const sequence = manualOrder.map((album) => album.id);
    // Grouped, an album moves among its group's albums, in the one arrangement (FR-05.8).
    const group = (
      parts.find((part) => part.albums.some((album) => album.id === id))?.albums ?? []
    ).map((album) => album.id);
    const name = albums.find((album) => album.id === id)?.title ?? "the album";
    return rearrange.move(sequence, group, id, to, name);
  };
  return (
    <AlbumSections
      list={list}
      parts={parts}
      linksOf={linksOf}
      layout={layout}
      onMove={manual ? onMove : undefined}
    />
  );
}
