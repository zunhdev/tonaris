// The standard confirmation dialog (DS-28, X-07), for every confirmed operation: a title naming the verb and the
// target, a scope block of counts, a consequences block saying what happens and whether it can be undone, and Cancel
// beside a button naming the action. Cancel has the focus, as confirmed operations here can't be undone, and the
// action uses the danger variant. Cancelling, Escape included, changes nothing.

import { useRef, type ReactNode } from "react";

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

export type Confirmation = {
  /** The verb and target, such as "Delete field 'Mood'?". */
  title: string;
  /** What it affects, each a line with its counts. */
  scope: ReactNode[];
  /** What happens, ending with whether it can be undone. */
  consequences: string[];
  /** The action and its scope, such as "Remove from 12 albums". */
  action: string;
  onConfirm: () => void;
};

export function ConfirmDialog({
  confirmation,
  onClose,
}: {
  /** The open confirmation; none closes the dialog. */
  confirmation: Confirmation | undefined;
  onClose: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={confirmation !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent initialFocus={cancel}>
        {confirmation && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
              <AlertDialogDescription render={<div />} className="flex flex-col gap-3">
                <ul className="flex list-disc flex-col gap-1 pl-5">
                  {confirmation.scope.map((line, index) => (
                    // oxlint-disable-next-line no-array-index-key
                    <li key={index}>{line}</li>
                  ))}
                </ul>
                {confirmation.consequences.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancel}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                onClick={() => {
                  confirmation.onConfirm();
                  onClose();
                }}
              >
                {confirmation.action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
