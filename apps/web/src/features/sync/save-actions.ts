// The actions on a write that Activity, its toast and the conflict review share (DS-80, DS-81), provided by the
// save-state layer, and the names they describe writes with.

import type { SyncClient } from "@/client/sync/client";
import type { Resubmitted } from "@/client/sync/resubmit";
import type { SaveState } from "@/client/sync/writer";
import { createContext, useContext } from "react";

import type { Names } from "./describe";

/** What the person can do with a write in Activity, a toast or the review. */
export type SaveActions = {
  /** Opens the conflict review for the write. */
  review(mutationId: string): void;
  /** Makes a failed write's change again (Retry), or a conflict's (Apply mine). */
  resubmit(state: SaveState): Resubmitted;
  /** Drops a failure, or keeps the current value of a conflict (Keep current). */
  dismiss(state: SaveState): void;
};

export const SaveActionsContext = createContext<SaveActions | undefined>(undefined);

/** The actions on writes; undefined before the sync client exists. */
export function useSaveActions(): SaveActions | undefined {
  return useContext(SaveActionsContext);
}

/** The names the collections hold now, for describing writes. */
export function namesOf(client: SyncClient): Names {
  return {
    album: (id) => client.albums.get(id)?.title,
    container: (id) => client.containers.get(id),
  };
}
