// Asking for a folder's or list's name in a share (TON-191): what to name, and the hook the header, the shortcuts and
// the palette open the name dialog with. Apart from the dialog (name-dialog.tsx), which reads the collection, so the
// collection's UI can ask for a name without importing it.

import { createContext, useContext } from "react";

import type { Container, ContainerKind } from "@tonaris/domain";

export type Naming =
  | { mode: "new"; kind: ContainerKind; parentId: string; parentName: string }
  | { mode: "rename"; container: Pick<Container, "id" | "kind" | "name"> };

export const NamingContext = createContext<(naming: Naming) => void>(() => {});

/** Asks for a name in a share: what the header's buttons and the shortcuts and palette open there (TON-195). */
export function useStartNaming(): (naming: Naming) => void {
  return useContext(NamingContext);
}
