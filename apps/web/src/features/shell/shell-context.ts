// What the shell offers the panes inside it (DS-30, DS-75, DS-78): hiding and showing the sidebar, the shortcut
// reference, and search.

import { createContext, useContext } from "react";

export type ShellControl = {
  sidebarHidden: boolean;
  toggleSidebar: () => void;
  openShortcuts: () => void;
  openSearch: () => void;
};

export const ShellContext = createContext<ShellControl>({
  sidebarHidden: false,
  toggleSidebar: () => {},
  openShortcuts: () => {},
  openSearch: () => {},
});

export function useShell(): ShellControl {
  return useContext(ShellContext);
}
