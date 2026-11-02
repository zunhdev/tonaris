// What the shell offers the panes inside it (DS-30, DS-75, DS-78): hiding and showing the sidebar, the shortcut
// reference, search, and the commands the shortcuts run, for menus and buttons that run them too (TON-117); and the
// account's menu, for a phone's top bar (DS-110).

import { createContext, useContext, type ReactNode } from "react";

import { inspectorWidths } from "./device";
import type { CommandRunner } from "./shortcuts";

export type ShellControl = {
  /** The signed-in account's compact menu, for a phone's top bar; undefined outside the workspace. */
  accountMenu?: ReactNode;
  sidebarHidden: boolean;
  /** Whether the inspector is open beside the view, taking `inspectorWidth` from it (DS-30). */
  inspectorBeside: boolean;
  /** The inspector's width, as resized on this device (TON-124). */
  inspectorWidth: number;
  toggleSidebar: () => void;
  openShortcuts: () => void;
  openSearch: () => void;
  /** Runs a command on a target, as its shortcut would. */
  runCommand: CommandRunner["run"];
  /** Why a command can't run on a target now, such as "You're offline". */
  commandBlocked: CommandRunner["blocked"];
};

export const ShellContext = createContext<ShellControl>({
  sidebarHidden: false,
  inspectorBeside: false,
  inspectorWidth: inspectorWidths.initial,
  toggleSidebar: () => {},
  openShortcuts: () => {},
  openSearch: () => {},
  runCommand: () => {},
  commandBlocked: () => undefined,
});

export function useShell(): ShellControl {
  return useContext(ShellContext);
}
