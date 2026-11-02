// Viewing and Editing (DS-45), kept per device, with the inline editors open now: leaving Editing first commits every
// open inline editor, and stays if one refuses its value. A context of its own (TON-150), so a mode switch re-renders
// only what reads the mode.

import { editMode, type Mode } from "@/common/device";
import { useNarrowScreen } from "@/common/media";
import { useAnnounce } from "@/features/sync/announcer";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CollectionMode = {
  /** Viewing or Editing (DS-45); always Viewing on a narrow screen, which is for browsing (FR-04.1). */
  mode: Mode;
  /** Switches the mode; answers whether it did. Leaving Editing commits the open inline editors first. */
  setMode: (next: Mode) => boolean;
  /**
   * Registers an open inline editor's commit, which saves a valid value or keeps a refused one open and answers
   * whether the editor closed; answers the unregister function.
   */
  registerEditor: (commit: () => boolean) => () => void;
};

const CollectionModeContext = createContext<CollectionMode | undefined>(undefined);

export function CollectionModeProvider({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const [stored, setStored] = useState<Mode>(() => editMode.read(accountId));
  const narrow = useNarrowScreen();
  const editors = useRef(new Set<() => boolean>());

  const value = useMemo<CollectionMode>(
    () => ({
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
    }),
    [accountId, narrow, stored],
  );

  return <CollectionModeContext value={value}>{children}</CollectionModeContext>;
}

export function useCollectionMode(): CollectionMode {
  const mode = useContext(CollectionModeContext);
  if (!mode) throw new Error("useCollectionMode() needs a CollectionUiProvider.");
  return mode;
}

/**
 * Viewing and Editing mode, with what switching says (DS-45, DS-83): edit intent switches to Editing first and
 * announces "Editing mode on"; the toggle and E switch either way. Leaving Editing commits the open inline editors,
 * and stays if one refuses its value. The mode is interface state only: switching sends nothing and changes no
 * permission (FR-04.2).
 */
export function useMode() {
  const { mode, setMode } = useCollectionMode();
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
