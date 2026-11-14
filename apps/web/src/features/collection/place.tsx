// Where the collection on screen lives (TON-191): the person's own, at `/c`, `/f/{id}` and `/l/{id}`, or a share they
// edit, at `/shared/{root}` with `?c=` for what is inside it. Links to folders and lists, and moves to them, ask here,
// so the same views work in both. The sidebar always shows the person's own (`OwnCollection`).

import { useSharedEntries } from "@/features/sharing/shared-entries";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { editsInsideShare, type Container } from "@tonaris/domain";

export type CollectionPlace =
  | { kind: "own" }
  | {
      kind: "share";
      /** The shared folder or list. */
      rootId: string;
      ownerName: string | null;
    };

const own: CollectionPlace = { kind: "own" };

export const CollectionPlaceContext = createContext<CollectionPlace>(own);

export function useCollectionPlace(): CollectionPlace {
  return useContext(CollectionPlaceContext);
}

/** The person's own collection's place, for what always shows it, such as the sidebar. */
export function OwnPlace({ children }: { children: ReactNode }) {
  return <CollectionPlaceContext value={own}>{children}</CollectionPlaceContext>;
}

/** A link opening a folder or list of the collection on screen. */
export function ContainerLink({
  container,
  ...props
}: { container: Pick<Container, "id" | "kind">; children: ReactNode } & Omit<
  ComponentPropsWithoutRef<"a">,
  "href" | "children"
>) {
  const place = useCollectionPlace();
  if (place.kind === "share") {
    return (
      <Link
        to="/shared/$containerId"
        params={{ containerId: place.rootId }}
        search={container.id === place.rootId ? {} : { c: container.id }}
        {...props}
      />
    );
  }
  return container.kind === "folder" ? (
    <Link to="/f/$folderId" params={{ folderId: container.id }} {...props} />
  ) : (
    <Link to="/l/$listId" params={{ listId: container.id }} {...props} />
  );
}

/** Opens a folder or list of the collection on screen, or, with none, its top: the collection, or the share's own. */
export function useOpenContainer() {
  const place = useCollectionPlace();
  const navigate = useNavigate();
  return useCallback(
    (container: Pick<Container, "id" | "kind"> | null, { replace = false } = {}) => {
      if (place.kind === "share") {
        const id = container?.id ?? place.rootId;
        return navigate({
          to: "/shared/$containerId",
          params: { containerId: place.rootId },
          search: id === place.rootId ? {} : { c: id },
          replace,
        });
      }
      if (container === null) return navigate({ to: "/c", replace });
      return container.kind === "folder"
        ? navigate({ to: "/f/$folderId", params: { folderId: container.id }, replace })
        : navigate({ to: "/l/$listId", params: { listId: container.id }, replace });
    },
    [place, navigate],
  );
}

/**
 * Why the person can't share what is on screen, or undefined if they can: sharing is the owner's, on the desktop
 * (DS-65). The header's Share, ⇧S and the palette's Share… all ask here (DRIFT-080).
 */
export function sharingRefusal(place: CollectionPlace, narrow: boolean): string | undefined {
  if (place.kind === "share") return "Only its owner can share it";
  if (narrow) return "Share from a computer";
  return undefined;
}

/**
 * Whether `id` is, for the person, the top of a share they edit, which only its owner moves or deletes (FR-07.20).
 * The domain's rule (`editsInsideShare`), with the shares from Shared with me: a folder or list inside another share
 * they edit isn't one, as the API and agents agree (DRIFT-046). Their own collection has none.
 */
export function useIsShareTop(): (id: string) => boolean {
  const place = useCollectionPlace();
  const { entries } = useSharedEntries();
  return useCallback(
    (id: string) => {
      if (place.kind !== "share") return false;
      const through = (entries ?? []).flatMap((entry) =>
        entry.available &&
        entry.role === "edit" &&
        (entry.containerId === id || entry.containers.some((each) => each.id === id))
          ? [entry.containerId]
          : [],
      );
      return !editsInsideShare(through, id);
    },
    [place, entries],
  );
}
