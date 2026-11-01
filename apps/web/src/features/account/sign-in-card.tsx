// The sign-in pages' frame (DS-90): the wordmark, mark and name (TON-114), above one card, with the terms and privacy
// notice linked below it (TON-131). Each step names the page with its own heading, `signInTitleId`. On the pages a
// signed-out visitor reaches, the wordmark leads to the landing page (`home`, TON-155), which says what Tonaris is.

import { LegalLinks } from "@/features/legal/legal-page";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Wordmark } from "@tonaris/ui/components/logo";

export const signInTitleId = "sign-in-title";

export function SignInCard({ children, home = false }: { children: ReactNode; home?: boolean }) {
  return (
    <main
      aria-labelledby={signInTitleId}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6"
    >
      <p>
        {home ? (
          <Link
            to="/welcome"
            aria-label="Tonaris, what it is"
            className="-mx-1.5 flex rounded-md px-1.5 py-0.5 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
          >
            <Wordmark size="page" />
          </Link>
        ) : (
          <Wordmark size="page" />
        )}
      </p>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-subtle bg-panel p-6">
        {children}
      </div>
      <LegalLinks />
    </main>
  );
}
