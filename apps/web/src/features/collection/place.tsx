// Where the collection on screen lives (TON-191): the person's own, at `/c`, `/f/{id}` and `/l/{id}`, or a share they
// edit, at `/shared/{root}` with `?c=` for what is inside it. Links to folders and lists, and moves to them, ask here,
// so the same views work in both. The sidebar always shows the person's own (`OwnCollection`).

import { Link, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import type { Container } from "@tonaris/domain";

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
