// The sidebar tree's shared state (DS-27, DS-78): the inline editor, the expanded folders (kept per device) and the
// tree item that has focus. The tree, the shortcuts, the views and the save-state layer's Edit all start editors
// through it, so there is one editor at a time; the shell shows a hidden sidebar when one starts. The view shown
// registers how to open its View options, for `V` (DS-49). `M` moves the focused folder or list: the tree's, else a
// view row's, else the view's own (DS-49). The mode, Viewing or Editing, is kept here too (DS-45): leaving Editing
// first commits every open inline editor, and stays if one refuses its value.

import { useAnnounce } from "@/features/sync/announcer";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useParams } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { ContainerKind } from "@tonaris/domain";

import { editMode, expandedFolders, type Mode } from "../shell/device";
import { emptyForm, type AlbumForm } from "./album-form";
import { createEditing, placeFor, type Editing, type Editor } from "./editing";
import { ancestorsOf, buildTree } from "./tree";

type CollectionUi = {
  accountId: string;
  editing: Editing;
  expanded: ReadonlySet<string>;
  setExpanded: (id: string, open: boolean) => void;
  /** Expands these folders, keeping the others as they are. */
  expand: (ids: Iterable<string>) => void;
  /** The container whose tree item has focus, while focus is in the tree. */
  focused: () => string | undefined;
  setFocused: (id: string | undefined) => void;
  /** Opens the current view's View options, if it has them. */
  openViewOptions: () => void;
  /** Registers how the current view opens its View options; undefined when it goes. */
  setViewOptionsOpener: (open: (() => void) | undefined) => void;
  /** The folder or list whose row in a view has focus, while one has. */
  focusedRow: () => string | undefined;
  setFocusedRow: (id: string | undefined) => void;
  /** The folder or list "Move to…" is open for, if it is open (DS-49). */
  moving: string | undefined;
  startMove: (id: string) => void;
  endMove: () => void;
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
  /** Viewing or Editing (DS-45); always Viewing on a narrow screen, which is for browsing (FR-04.1). */
  mode: Mode;
  /** Switches the mode; answers whether it did. Leaving Editing commits the open inline editors first. */
  setMode: (next: Mode) => boolean;
  /**
   * Registers an open inline editor's commit, which saves a valid value or keeps a refused one open and answers
   * whether the editor closed; answers the unregister function.
   */
  registerEditor: (commit: () => boolean) => () => void;
  /** The album whose row or card in a view has focus, while one has: what L adds to a list. */
  focusedAlbum: () => string | undefined;
  setFocusedAlbum: (id: string | undefined) => void;
  /** The album "Add to list…" is open for, if it is open (DS-46). */
  addingToList: string | undefined;
  startAddToList: (albumId: string) => void;
  endAddToList: () => void;
  /** The manual entry form, while it is open (DS-47). */
  newAlbum: NewAlbumDraft | undefined;
  startNewAlbum: (draft: NewAlbumDraft) => void;
  endNewAlbum: () => void;
};

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

const CollectionUiContext = createContext<CollectionUi | undefined>(undefined);

export function CollectionUiProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const [editing] = useState(createEditing);
  const [expanded, setExpandedState] = useState(() => expandedFolders.read(accountId));
  const focused = useRef<string | undefined>(undefined);
  const viewOptions = useRef<(() => void) | undefined>(undefined);
  const focusedRow = useRef<string | undefined>(undefined);
  const [moving, setMoving] = useState<string | undefined>(undefined);
  const [sharing, setSharing] = useState<string | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | undefined>(undefined);
  const [deletingAlbum, setDeletingAlbum] = useState<string | undefined>(undefined);
  const [stored, setStored] = useState<Mode>(() => editMode.read(accountId));
  const narrow = useNarrowScreen();
  const editors = useRef(new Set<() => boolean>());
  const focusedAlbum = useRef<string | undefined>(undefined);
  const [addingToList, setAddingToList] = useState<string | undefined>(undefined);
  const [newAlbum, setNewAlbum] = useState<NewAlbumDraft | undefined>(undefined);

  const update = useCallback(
    (change: (current: Set<string>) => void) => {
      setExpandedState((current) => {
        const next = new Set(current);
        change(next);
        if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
        expandedFolders.write(accountId, next);
        return next;
      });
    },
    [accountId],
  );

  const value = useMemo<CollectionUi>(
    () => ({
      accountId,
      editing,
      expanded,
      setExpanded: (id, open) =>
        update((next) => {
          if (open) next.add(id);
          else next.delete(id);
        }),
      expand: (ids) =>
        update((next) => {
          for (const id of ids) next.add(id);
        }),
      focused: () => focused.current,
      setFocused: (id) => {
        focused.current = id;
      },
      openViewOptions: () => viewOptions.current?.(),
      setViewOptionsOpener: (open) => {
        viewOptions.current = open;
      },
      focusedRow: () => focusedRow.current,
      setFocusedRow: (id) => {
        focusedRow.current = id;
      },
      moving,
      startMove: setMoving,
      endMove: () => setMoving(undefined),
      sharing,
      startShare: setSharing,
      endShare: () => setSharing(undefined),
      deleting,
      startDelete: setDeleting,
      endDelete: () => setDeleting(undefined),
      deletingAlbum,
      startDeleteAlbum: setDeletingAlbum,
      endDeleteAlbum: () => setDeletingAlbum(undefined),
      mode: narrow ? "view" : stored,
      setMode: (next) => {
        if (next === stored) return true;
        if (next === "view") {
          // Every editor commits, so each refused one shows its error.
          const closed = [...editors.current].map((commit) => commit());
          if (closed.includes(false)) return false;
        }
        editMode.write(accountId, next);
        setStored(next);
        return true;
      },
      registerEditor: (commit) => {
        editors.current.add(commit);
        return () => editors.current.delete(commit);
      },
      focusedAlbum: () => focusedAlbum.current,
      setFocusedAlbum: (id) => {
        focusedAlbum.current = id;
      },
      addingToList,
      startAddToList: setAddingToList,
      endAddToList: () => setAddingToList(undefined),
      newAlbum,
      startNewAlbum: setNewAlbum,
      endNewAlbum: () => setNewAlbum(undefined),
    }),
    [
      accountId,
      editing,
      expanded,
      update,
      moving,
      sharing,
      deleting,
      deletingAlbum,
      stored,
      narrow,
      addingToList,
      newAlbum,
    ],
  );

  return <CollectionUiContext value={value}>{children}</CollectionUiContext>;
}

export function useCollectionUi(): CollectionUi {
  const ui = useContext(CollectionUiContext);
  if (!ui) throw new Error("useCollectionUi() needs a CollectionUiProvider.");
  return ui;
}

/** The open inline editor, if any. */
export function useEditor(): Editor | undefined {
  const { editing } = useCollectionUi();
  const subscribe = useCallback((listener: () => void) => editing.subscribe(listener), [editing]);
  return useSyncExternalStore(subscribe, () => editing.current);
}

/** The folder or list the main view shows, from the route. */
export function useViewContainerId(): string | undefined {
  const params = useParams({ strict: false });
  return params.folderId ?? params.listId;
}

/**
 * Opens the manual entry form (DS-47), going to the list on view, if one is, switching to Editing first, since adding
 * is an edit (DS-45).
 */
export function useStartNewAlbum(): () => void {
  const { enterEditing } = useMode();
  const { startNewAlbum } = useCollectionUi();
  const listId = useParams({ strict: false }).listId ?? null;
  return useCallback(() => {
    enterEditing();
    startNewAlbum({ form: emptyForm(listId) });
  }, [enterEditing, startNewAlbum, listId]);
}

/**
 * Starts an editor: shows the sidebar and expands the folders down to where it appears. A create goes into the
 * folder that `placeFor` names when no parent is given.
 */
export function useStartEditor(): (editor: Editor | { mode: "new"; kind: ContainerKind }) => void {
  const { enterEditing } = useMode();
  const client = useSyncClient();
  const ui = useCollectionUi();
  const viewId = useViewContainerId();
  return useCallback(
    (request) => {
      if (!client) return;
      const containers = client.containers;
      let editor: Editor;
      if (request.mode === "new") {
        const focusedId = ui.focused();
        const focused = focusedId === undefined ? undefined : containers.get(focusedId);
        const view = viewId === undefined ? undefined : containers.get(viewId);
        editor = {
          mode: "create",
          kind: request.kind,
          parentId: placeFor(focused, view),
          name: "",
        };
      } else editor = request;
      const tree = buildTree(containers.values());
      const shown = editor.mode === "create" ? editor.parentId : editor.id;
      if (shown !== null) {
        const path = ancestorsOf(tree, shown).map((folder) => folder.id);
        ui.expand(editor.mode === "create" ? [...path, shown] : path);
      }
      // Naming and renaming are edits: they switch to Editing first (DS-45).
      enterEditing();
      ui.editing.start(editor);
    },
    [client, ui, viewId, enterEditing],
  );
}

const narrowQuery = "(max-width: 767px)";

/** Whether the screen is narrower than the desktop app (DS-110): there the app is for browsing. */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = globalThis.matchMedia?.(narrowQuery);
      query?.addEventListener("change", listener);
      return () => query?.removeEventListener("change", listener);
    },
    () => globalThis.matchMedia?.(narrowQuery).matches ?? false,
  );
}

/**
 * Viewing and Editing mode, with what switching says (DS-45, DS-83): edit intent switches to Editing first and
 * announces "Editing mode on"; the toggle and E switch either way. Leaving Editing commits the open inline editors,
 * and stays if one refuses its value. The mode is interface state only: switching sends nothing and changes no
 * permission (FR-04.2).
 */
export function useMode() {
  const { mode, setMode } = useCollectionUi();
  const announce = useAnnounce();

  /** Edit intent: switches to Editing before the edit starts. */
  const enterEditing = useCallback(() => {
    if (mode === "view" && setMode("edit")) announce("Editing mode on");
  }, [mode, setMode, announce]);

  /** The toggle and E; answers whether the mode is now `next`. */
  const choose = useCallback(
    (next: Mode) => {
      if (next === mode) return true;
      if (!setMode(next)) return false;
      announce(next === "edit" ? "Editing mode on" : "Editing mode off");
      return true;
    },
    [mode, setMode, announce],
  );

  return { mode, editing: mode === "edit", enterEditing, choose };
}
