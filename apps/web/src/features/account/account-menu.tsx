// The account menu at the top of the sidebar (DS-31): the display name, or the email until there is one. Settings,
// Admin and the shortcuts list join **Sign out** with their issues.

import { useRouter } from "@tanstack/react-router";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { useState } from "react";

import type { Account } from "@tonaris/domain";
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
  const [error, setError] = useState<string>();

  async function leave() {
    setError(undefined);
    const result = await signOut();
    if (!result.ok) {
      setError(authFailureMessage(result));
      return;
    }
    forgetAccount();
    forgetSignIn();
    await router.navigate({ to: "/sign-in" });
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
          <DropdownMenuItem onClick={() => void leave()}>
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
    </div>
  );
}
