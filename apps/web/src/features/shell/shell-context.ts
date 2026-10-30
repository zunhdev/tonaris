// What the shell offers the panes inside it (DS-30, DS-75, DS-78): hiding and showing the sidebar, the shortcut
// reference, and search; and the account, for a phone's top bar (DS-110).

import { createContext, useContext } from "react";

import type { Account } from "@tonaris/domain";

/** The inspector's width beside the view (DS-30). */
export const inspectorWidth = 380;

export type ShellControl = {
  /** The signed-in account; undefined outside the workspace. */
  account?: Account;
  sidebarHidden: boolean;
  /** Whether the inspector is open beside the view, taking `inspectorWidth` from it (DS-30). */
  inspectorBeside: boolean;
  toggleSidebar: () => void;
  openShortcuts: () => void;
  openSearch: () => void;
};

export const ShellContext = createContext<ShellControl>({
  sidebarHidden: false,
  inspectorBeside: false,
  toggleSidebar: () => {},
  openShortcuts: () => {},
  openSearch: () => {},
});

export function useShell(): ShellControl {
  return useContext(ShellContext);
}
