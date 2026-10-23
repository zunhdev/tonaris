// The ConflictView (DS-29, DS-80; FR-09.4): a change that met a newer saved value, field by field, the current
// value beside the person's. **Keep current** discards their attempt, **Apply mine** saves it again over the
// current value. Nothing is applied until they choose; closing it leaves the conflict in Activity. When and by whom
// the current value was saved would show here if known, but the conflict outcome carries neither.

import type { SaveState } from "@/client/sync/writer";
import { useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tonaris/ui/components/alert-dialog";

import { describeWrite, fieldLabel, fieldValue } from "./describe";
import { namesOf, useSaveActions } from "./save-actions";
import { useSyncClient } from "./sync-provider";

export function ConflictView({
  state,
  onClose,
}: {
  /** The conflict under review; the view is closed without one. */
  state: SaveState | undefined;
  onClose: () => void;
}) {
  const client = useSyncClient();
  const actions = useSaveActions();
  // Keeping the current value changes nothing, so it has the focus.
  const keep = useRef<HTMLButtonElement>(null);
  const [gone, setGone] = useState(false);
  const outcome = state?.outcome?.status === "conflict" ? state.outcome : undefined;
  const names = client && namesOf(client);

  function close() {
    setGone(false);
    onClose();
  }

  return (
    <AlertDialog
      open={state !== undefined}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AlertDialogContent initialFocus={keep} className="max-w-lg">
        {state && outcome && names && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {describeWrite(state.mutation, names).subject} changed while you were editing
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your change wasn't saved. Keep the current version, or apply yours over it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <table className="w-full table-fixed text-left">
              <thead className="text-small text-fg-tertiary">
                <tr>
                  <th scope="col" className="w-28 pb-1 font-medium">
                    <span className="sr-only">Field</span>
                  </th>
                  <th scope="col" className="pb-1 font-medium">
                    Current
                  </th>
                  <th scope="col" className="pb-1 font-medium">
                    Yours
                  </th>
                </tr>
              </thead>
              <tbody>
                {outcome.conflicts.map((conflict) => (
                  <tr key={conflict.field} className="border-t border-subtle align-top">
                    <th scope="row" className="py-1.5 pr-2 font-medium text-fg-secondary">
                      {fieldLabel(conflict.field, names)}
                    </th>
                    <td className="py-1.5 pr-2 break-words">
                      {fieldValue(conflict.field, conflict.current, names)}
                    </td>
                    <td className="py-1.5 break-words">
                      {fieldValue(conflict.field, conflict.attempted, names, "attempted")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {gone && (
              <p role="alert" className="text-small text-status-danger">
                This no longer exists, so your version can't be applied.
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel ref={keep} onClick={() => actions?.dismiss(state)}>
                Keep current
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={gone}
                onClick={() => {
                  if (actions?.resubmit(state) === "gone") setGone(true);
                  else close();
                }}
              >
                Apply mine
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
