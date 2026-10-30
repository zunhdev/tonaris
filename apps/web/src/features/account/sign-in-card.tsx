// The sign-in pages' frame (DS-90): the wordmark, mark and name (TON-114), above one card. Each step names the page with its own heading,
// `signInTitleId`.

import type { ReactNode } from "react";

import { Wordmark } from "@tonaris/ui/components/logo";

export const signInTitleId = "sign-in-title";

export function SignInCard({ children }: { children: ReactNode }) {
  return (
    <main
      aria-labelledby={signInTitleId}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6"
    >
      <p>
        <Wordmark size="page" />
      </p>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-subtle bg-panel p-6">
        {children}
      </div>
    </main>
  );
}
