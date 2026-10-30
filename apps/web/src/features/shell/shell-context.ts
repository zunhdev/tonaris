// What the shell offers the panes inside it (DS-30, DS-75, DS-78): hiding and showing the sidebar, the shortcut
// reference, search, and the commands the shortcuts run, for menus and buttons that run them too (TON-117); and the
// account, for a phone's top bar (DS-110).

import { createContext, useContext } from "react";

import type { Account } from "@tonaris/domain";

import type { CommandRunner } from "./use-shortcuts";

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
  /** Runs a command on a target, as its shortcut would. */
  runCommand: CommandRunner["run"];
  /** Why a command can't run on a target now, such as "You're offline". */
  commandBlocked: CommandRunner["blocked"];
};

export const ShellContext = createContext<ShellControl>({
  sidebarHidden: false,
  inspectorBeside: false,
  toggleSidebar: () => {},
  openShortcuts: () => {},
  openSearch: () => {},
  runCommand: () => {},
  commandBlocked: () => undefined,
});

export function useShell(): ShellControl {
  return useContext(ShellContext);
}
