// The person's own collection, whatever is on screen (TON-191): what always shows it, the sidebar and the palette,
// reads and writes it through this, even while a share they edit is on screen.

import { OwnSyncProvider } from "@/features/sync/sync-provider";
import type { ReactNode } from "react";

import { OwnCollectionData } from "./data";
import { OwnPlace } from "./place";

export function OwnCollection({ children }: { children: ReactNode }) {
  return (
    <OwnSyncProvider>
      <OwnCollectionData>
        <OwnPlace>{children}</OwnPlace>
      </OwnCollectionData>
    </OwnSyncProvider>
  );
}
