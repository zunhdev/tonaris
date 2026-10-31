// The account menu at the top of the sidebar (DS-31): the display name, or the email until there is one.
// **Settings** leads to Settings → Preferences, the first settings page built (DS-92); **Admin**, for the creator
// only, to Admin → Admissions (DS-100); **Keyboard shortcuts** opens the reference (DS-78); and **Feedback and
// ideas** opens the feedback board, when there is one, already signed in (FR-11.15). Signing out deletes
// what this browser keeps for the account: unsent changes and conflicts waiting for review. With changes still
// unsent, it asks first (decided 22 October 2026). On a phone it is the top bar's Account button, without Admin or
// the shortcuts, which a phone doesn't have (DS-110).

import { feedbackUrl } from "@/config";
import { useShell } from "@/features/shell/shell-context";
import { useSyncClient } from "@/features/sync/sync-provider";
import { useRouter } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  CircleUser,
  FileText,
  Keyboard,
  LogOut,
  MessageSquare,
  Settings,
  ShieldCheck,
} from "lucide-react";
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

export function AccountMenu({
  account,
  compact = false,
}: {
  account: Account;
  /** The phone's top bar: an icon button, and only what a phone offers (DS-110). */
  compact?: boolean;
}) {
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
    <div className={compact ? "flex shrink-0" : "flex flex-col gap-1 px-2"}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            compact ? (
              <Button variant="ghost" size="icon" className="size-11" />
            ) : (
              <Button variant="ghost" className="w-full justify-start" />
            )
          }
          aria-label={`Account: ${account.displayName ?? account.email}`}
        >
          {compact ? (
            <CircleUser strokeWidth={1.5} aria-hidden />
          ) : (
            <>
              <span className="min-w-0 flex-1 truncate text-left">
                {account.displayName ?? account.email}
              </span>
              <ChevronsUpDown strokeWidth={1.5} aria-hidden />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={compact ? "end" : "start"}>
          <DropdownMenuItem onClick={() => void router.navigate({ to: "/settings/preferences" })}>
            <Settings strokeWidth={1.5} aria-hidden />
            Settings
          </DropdownMenuItem>
          {account.role === "creator" && !compact && (
            <DropdownMenuItem onClick={() => void router.navigate({ to: "/admin/admissions" })}>
              <ShieldCheck strokeWidth={1.5} aria-hidden />
              Admin
            </DropdownMenuItem>
          )}
          {!compact && (
            <DropdownMenuItem onClick={openShortcuts}>
              <Keyboard strokeWidth={1.5} aria-hidden />
              Keyboard shortcuts
            </DropdownMenuItem>
          )}
          {/* The feedback board, signed in through Tonaris (FR-11.15, TON-144), on phones too; only when there is one. */}
          {feedbackUrl && (
            <DropdownMenuItem onClick={() => window.open(feedbackUrl, "_blank", "noopener")}>
              <MessageSquare strokeWidth={1.5} aria-hidden />
              Feedback and ideas
            </DropdownMenuItem>
          )}
          {/* Always at hand, as YouTube's policies ask (TON-131); each opens in a new tab, leaving the workspace be. */}
          <DropdownMenuItem onClick={() => window.open("/terms", "_blank", "noopener")}>
            <FileText strokeWidth={1.5} aria-hidden />
            Terms of use
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open("/privacy", "_blank", "noopener")}>
            <FileText strokeWidth={1.5} aria-hidden />
            Privacy notice
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
