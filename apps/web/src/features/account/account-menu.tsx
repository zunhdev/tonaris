// The account menu at the top of the sidebar (DS-31): the display name, or the email until there is one.
// **Connections** leads to Settings → Connections (DS-86), the only settings page so far, and **Keyboard
// shortcuts** opens the reference (DS-78); Admin joins **Sign out** with its issue. Signing out deletes what this browser keeps for the account:
// unsent changes and conflicts waiting for review. With changes still unsent, it asks first (decided 22 October
// 2026).

import { useShell } from "@/features/shell/shell-context";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useRouter } from "@tanstack/react-router";
import { ChevronsUpDown, Keyboard, LogOut, Plug } from "lucide-react";
import { useRef, useState } from "react";

import type { Account } from "@tonaris/domain";
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
import { Button } from "@tonaris/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@tonaris/ui/components/dropdown-menu";

import { authFailureMessage, signOut } from "./auth-client";
import { forgetSignIn } from "./pending-sign-in";
import { forgetAccount } from "./session";

export function AccountMenu({ account }: { account: Account }) {
  const router = useRouter();
  const sync = useSyncClient();
  const { openShortcuts } = useShell();
  const [error, setError] = useState<string>();
  /** The unsent changes the person is asked about, while the dialog is open. */
  const [unsent, setUnsent] = useState<number>();
  // Discarding changes can't be undone, so Cancel has the focus (DS-28).
  const cancel = useRef<HTMLButtonElement>(null);

  async function leave() {
    setUnsent(undefined);
    setError(undefined);
    const result = await signOut();
    if (!result.ok) {
      setError(authFailureMessage(result));
      return;
    }
    await sync?.clear();
    forgetAccount();
    forgetSignIn();
    await router.navigate({ to: "/sign-in" });
  }

  function chooseSignOut() {
    const waiting = sync?.unsent ?? 0;
    if (waiting > 0) setUnsent(waiting);
    else void leave();
  }

  return (
    <div className="flex flex-col gap-1 px-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" className="w-full justify-start" />}
          aria-label={`Account: ${account.displayName ?? account.email}`}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {account.displayName ?? account.email}
          </span>
          <ChevronsUpDown strokeWidth={1.5} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => void router.navigate({ to: "/settings/connections" })}>
            <Plug strokeWidth={1.5} aria-hidden />
            Connections
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openShortcuts}>
            <Keyboard strokeWidth={1.5} aria-hidden />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem onClick={chooseSignOut}>
            <LogOut strokeWidth={1.5} aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="px-2.5 text-small text-status-danger">
          {error}
        </p>
      )}
      <AlertDialog
        open={unsent !== undefined}
        onOpenChange={(open) => {
          if (!open) setUnsent(undefined);
        }}
      >
        <AlertDialogContent initialFocus={cancel}>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {unsent === 1 ? "1 change hasn't" : `${unsent} changes haven't`} been saved yet.
              Signing out discards {unsent === 1 ? "it" : "them"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => void leave()}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
