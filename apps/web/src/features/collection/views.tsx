// The collection views' frames (DS-30, DS-32, DS-105; FR-01.3): each view's header (breadcrumbs, its name as the
// heading and in the page title) and, until TON-34's rows replace it, a one-line summary of what it holds, or its
// empty state with one way forward. A folder link that names a list leads to the list, and the other way round; a
// folder or list that doesn't exist says so, once the collection has loaded.

import { PageHeader } from "@/features/shell/page-header";
import { useConnection } from "@/features/sync/sync-provider";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import type { ContainerKind } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";

import { useStartEditor } from "./collection-ui";
import { useCollectionData } from "./data";
import { ancestorsOf } from "./tree";

/** Names the page "{title} · Tonaris": the view's name is only in the client store, so the route can't. */
function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · Tonaris`;
  }, [title]);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Body({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {children}
    </div>
  );
}

function Summary({ children }: { children: ReactNode }) {
  return (
    <Body>
      <p className="text-fg-secondary">{children}</p>
    </Body>
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
      <PageHeader title="Collection" />
      {!ready ? null : count > 0 ? (
        <Summary>{plural(count, "folder or list", "folders and lists")}</Summary>
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
  const { tree, counts, ready } = useCollectionData();
  const navigate = useNavigate();
  const container = tree.byId.get(id);
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
    const inside = tree.children.get(id)?.length ?? 0;
    body =
      inside > 0 ? (
        <Summary>{plural(inside, "folder or list", "folders and lists")}</Summary>
      ) : (
        <Empty text="This folder is empty." action={<NewListButton parentId={id} />} />
      );
  } else {
    const albums = counts.get(id) ?? 0;
    // Add album comes with capture and manual entry (M3, TON-38).
    body =
      albums > 0 ? (
        <Summary>{plural(albums, "album", "albums")}</Summary>
      ) : (
        <Empty text="No albums yet. Paste a Spotify, Apple Music, Qobuz or Tidal link." />
      );
  }

  return (
    <>
      <PageHeader title={container.name} breadcrumbs={breadcrumbs} />
      {body}
    </>
  );
}

export function UnsortedView() {
  const { unsorted, ready } = useCollectionData();
  useDocumentTitle("Unsorted");
  return (
    <>
      <PageHeader title="Unsorted" />
      {!ready ? null : unsorted > 0 ? (
        <Summary>{plural(unsorted, "album", "albums")}</Summary>
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
