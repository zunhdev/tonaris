// The sign-in pages' frame (DS-90): the wordmark above one card. Each step names the page with its own heading,
// `signInTitleId`.

import type { ReactNode } from "react";

export const signInTitleId = "sign-in-title";

export function SignInCard({ children }: { children: ReactNode }) {
  return (
    <main
      aria-labelledby={signInTitleId}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6"
    >
      <p className="text-title text-fg-primary">Tonaris</p>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-subtle bg-panel p-6">
        {children}
      </div>
    </main>
  );
}
