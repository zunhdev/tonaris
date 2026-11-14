// Which of the workspace's dialogs is open, and for what (TON-150): "Move to…" (DS-49), sharing (DS-65), deleting a
// folder or an album (DS-50), "Add to list…" (DS-46) and the manual entry form (DS-47). The shell draws them; the
// tree, the views, the shortcuts and the save-state layer open them. A context of its own, so opening one re-renders
// only what reads the dialogs.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { SharingImpact } from "@tonaris/domain";

import type { AlbumForm } from "./album-form";

/**
 * A capture the manual entry form continues (DS-47, DS-48): its write, its link, and why it came to the form. In
 * `details` mode, saving completes the capture with the album's details and the link is kept by it; in `failed` mode,
 * the album is added as the form always adds one, with the link in its service's field.
 */
export type CaptureEntry = {
  mode: "details" | "failed";
  mutationId: string;
  link: string;
  reason: string;
};

/**
 * The manual entry form's starting values, the failed writes it makes again, if Edit opened it, and the capture it
 * continues, if Enter manually opened it.
 */
export type NewAlbumDraft = {
  form: AlbumForm;
  replaces?: readonly string[];
  capture?: CaptureEntry;
};

/** A move that would change who sees what, waiting for the owner's word (DS-49, FR-07.14; TON-226). */
export type MoveToConfirm = {
  id: string;
  to: string | null;
  /** What it does to sharing, or `failed` when that couldn't be read. */
  impact: SharingImpact | "failed";
};

type CollectionDialogs = {
  /** The folder or list "Move to…" is open for, if it is open (DS-49). */
  moving: string | undefined;
  startMove: (id: string) => void;
  endMove: () => void;
  /** The move being confirmed, if one is (TON-226). */
  confirmingMove: MoveToConfirm | undefined;
  startConfirmMove: (move: MoveToConfirm) => void;
  endConfirmMove: () => void;
  /** The folder or list ⌘K's "Color…" is open for, if it is open (TON-175). */
  coloring: string | undefined;
  startColor: (id: string) => void;
  endColor: () => void;
  /** The folder or list whose sharing dialog is open (DS-65). */
  sharing: string | undefined;
  startShare: (id: string) => void;
  endShare: () => void;
  /** The folder whose deletion is being confirmed, if one is (DS-50). */
  deleting: string | undefined;
  startDelete: (id: string) => void;
  endDelete: () => void;
  /** The album whose deletion from the collection is being confirmed, if one is (DS-50). */
  deletingAlbum: string | undefined;
  startDeleteAlbum: (id: string) => void;
  endDeleteAlbum: () => void;
  /** The item "Move to position…" is open for, if it is open (DS-49, TON-230). */
  positioning: string | undefined;
  startPositioning: (id: string) => void;
  endPositioning: () => void;
  /** The albums "Add to list…" is open for, if it is open (DS-46): one, or the selection (TON-231). */
  addingToList: readonly string[] | undefined;
  startAddToList: (albumIds: string | readonly string[]) => void;
  endAddToList: () => void;
  /** The selected albums whose deletion from the collection is being confirmed, if some are (TON-231). */
  deletingAlbums: readonly string[] | undefined;
  startDeleteAlbums: (ids: readonly string[]) => void;
  endDeleteAlbums: () => void;
  /** The manual entry form, while it is open (DS-47). */
  newAlbum: NewAlbumDraft | undefined;
  startNewAlbum: (draft: NewAlbumDraft) => void;
  endNewAlbum: () => void;
};

const CollectionDialogsContext = createContext<CollectionDialogs | undefined>(undefined);

export function CollectionDialogsProvider({ children }: { children: ReactNode }) {
  const [moving, setMoving] = useState<string | undefined>(undefined);
  const [confirmingMove, setConfirmingMove] = useState<MoveToConfirm | undefined>(undefined);
  const [coloring, setColoring] = useState<string | undefined>(undefined);
  const [sharing, setSharing] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | undefined>(undefined);
  const [deletingAlbum, setDeletingAlbum] = useState<string | undefined>(undefined);
  const [addingToList, setAddingToList] = useState<readonly string[] | undefined>(undefined);
  const [deletingAlbums, setDeletingAlbums] = useState<readonly string[] | undefined>(undefined);
  const [positioning, setPositioning] = useState<string | undefined>(undefined);
  const [newAlbum, setNewAlbum] = useState<NewAlbumDraft | undefined>(undefined);

  const value = useMemo<CollectionDialogs>(
    () => ({
      moving,
      startMove: setMoving,
      endMove: () => setMoving(undefined),
      confirmingMove,
      startConfirmMove: setConfirmingMove,
      endConfirmMove: () => setConfirmingMove(undefined),
      coloring,
      startColor: setColoring,
      endColor: () => setColoring(undefined),
      sharing,
      startShare: setSharing,
      endShare: () => setSharing(undefined),
      deleting,
      startDelete: setDeleting,
      endDelete: () => setDeleting(undefined),
      deletingAlbum,
      startDeleteAlbum: setDeletingAlbum,
      endDeleteAlbum: () => setDeletingAlbum(undefined),
      positioning,
      startPositioning: setPositioning,
      endPositioning: () => setPositioning(undefined),
      addingToList,
      startAddToList: (ids) => setAddingToList(typeof ids === "string" ? [ids] : ids),
      endAddToList: () => setAddingToList(undefined),
      deletingAlbums,
      startDeleteAlbums: setDeletingAlbums,
      endDeleteAlbums: () => setDeletingAlbums(undefined),
      newAlbum,
      startNewAlbum: setNewAlbum,
      endNewAlbum: () => setNewAlbum(undefined),
    }),
    [
      moving,
      confirmingMove,
      coloring,
      sharing,
      deleting,
      deletingAlbum,
      deletingAlbums,
      positioning,
      addingToList,
      newAlbum,
    ],
  );

  return <CollectionDialogsContext value={value}>{children}</CollectionDialogsContext>;
}

export function useCollectionDialogs(): CollectionDialogs {
  const dialogs = useContext(CollectionDialogsContext);
  if (!dialogs) throw new Error("useCollectionDialogs() needs a CollectionUiProvider.");
  return dialogs;
}
