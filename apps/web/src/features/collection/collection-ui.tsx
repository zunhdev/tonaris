// The sidebar tree's shared state (DS-27, DS-78): the inline editor, the expanded folders (kept per device) and the
// tree item that has focus. The tree, the shortcuts, the views and the save-state layer's Edit all start editors
// through it, so there is one editor at a time; the shell shows a hidden sidebar when one starts. The view shown
// registers how to open its View options, for `V` (DS-49). `M` moves the focused folder or list: the tree's, else a
// view row's, else the view's own (DS-49). The mode (collection-mode.tsx) and the open dialogs
// (collection-dialogs.tsx) are contexts of their own, provided here with it (TON-150).

import { expandedFolders } from "@/common/device";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useParams, useSearch } from "@tanstack/react-router";
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

import { CollectionDialogsProvider } from "./collection-dialogs";
import { CollectionModeProvider, useMode } from "./collection-mode";
import { createEditing, placeFor, type Editing, type Editor } from "./editing";
import { useCollectionPlace } from "./place";
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
  /** The album whose row or card in a view has focus, while one has: what L adds to a list. */
  focusedAlbum: () => string | undefined;
  setFocusedAlbum: (id: string | undefined) => void;
};

const CollectionUiContext = createContext<CollectionUi | undefined>(undefined);

/** The collection's interface state: the tree's, the mode and the open dialogs. */
export function CollectionUiProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  return (
    <CollectionModeProvider accountId={accountId}>
      <CollectionDialogsProvider>
        <TreeUiProvider accountId={accountId}>{children}</TreeUiProvider>
      </CollectionDialogsProvider>
    </CollectionModeProvider>
  );
}

function TreeUiProvider({ accountId, children }: { accountId: string; children: ReactNode }) {
  const [editing] = useState(createEditing);
  const [expanded, setExpandedState] = useState(() => expandedFolders.read(accountId));
  const focused = useRef<string | undefined>(undefined);
  const viewOptions = useRef<(() => void) | undefined>(undefined);
  const focusedRow = useRef<string | undefined>(undefined);
  const focusedAlbum = useRef<string | undefined>(undefined);

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
      focusedAlbum: () => focusedAlbum.current,
      setFocusedAlbum: (id) => {
        focusedAlbum.current = id;
      },
    }),
    [accountId, editing, expanded, update],
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
  const search = useSearch({ strict: false });
  const place = useCollectionPlace();
  // In a share the person edits, the folder or list it shows (TON-191); a share they only view has none to edit.
  if (place.kind === "share") return search.c ?? place.rootId;
  return params.folderId ?? params.listId;
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
