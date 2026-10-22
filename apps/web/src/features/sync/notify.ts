// How features raise toasts (DS-108): through the workspace's notifier, which holds the kinds and their durations.
// Undo toasts (DS-50) and capture's outcomes (DS-48) use it with the save-state layer's own.

import { createContext, useContext } from "react";

import type { Notifier } from "@tonaris/ui/components/toast";

export const NotifyContext = createContext<Notifier | undefined>(undefined);

/** The workspace's toasts; undefined outside it. */
export function useNotify(): Notifier | undefined {
  return useContext(NotifyContext);
}
