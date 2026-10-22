// What the shell offers the panes inside it (DS-30, DS-78): hiding and showing the sidebar, and the shortcut
// reference.

import { createContext, useContext } from "react";

export type ShellControl = {
  sidebarHidden: boolean;
  toggleSidebar: () => void;
  openShortcuts: () => void;
};

export const ShellContext = createContext<ShellControl>({
  sidebarHidden: false,
  toggleSidebar: () => {},
  openShortcuts: () => {},
});

export function useShell(): ShellControl {
  return useContext(ShellContext);
}
