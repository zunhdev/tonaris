// The actions on a write or a batch report that Activity, toasts and the conflict review share (DS-80, DS-81,
// DS-84), provided by the save-state layer, and the names they describe writes with.

import type { SyncClient } from "@/client/sync/client";
import type { Resubmitted } from "@/client/sync/resubmit";
import type { BatchReport, SaveState } from "@/client/sync/writer";
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
  /** Retries a report's failed items `ids`, with the items that waited for them, into the report (DS-84). */
  retry(report: BatchReport, ids: readonly string[]): Resubmitted[];
  /** Dismisses a report and the inputs it kept. */
  dismissReport(report: BatchReport): void;
  /** Whether a failure can be edited: a folder or list's create or rename whose place still exists (DS-80). */
  canEdit(state: SaveState): boolean;
  /** Reopens the failed create or rename's editor with the name attempted; saving it clears the failure. */
  edit(state: SaveState): void;
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
