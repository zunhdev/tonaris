// The sign-in pages' frame (DS-90): the wordmark, mark and name (TON-114), above one card. Each step names the page
// with its own heading, `signInTitleId`. The sign-in steps add what Tonaris is beside the card (`promo`, TON-116):
// on the desktop, the promo on the left and the card on the right; on a phone, the card first and the promo below.

import type { ReactNode } from "react";

import { Wordmark } from "@tonaris/ui/components/logo";

import { Promo } from "./promo";

export const signInTitleId = "sign-in-title";

const cardClass =
  "flex w-full max-w-sm flex-col gap-4 rounded-xl border border-subtle bg-panel p-6";

export function SignInCard({ children, promo = false }: { children: ReactNode; promo?: boolean }) {
  if (!promo) {
    return (
      <main
        aria-labelledby={signInTitleId}
        className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6"
      >
        <p>
          <Wordmark size="page" />
        </p>
        <div className={cardClass}>{children}</div>
      </main>
    );
  }
  return (
    <main
      aria-labelledby={signInTitleId}
      className="flex min-h-dvh items-center justify-center p-6 md:p-10"
    >
      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-[minmax(0,1fr)_24rem] md:gap-16">
        {/* The page's task first, also for screen readers; on the desktop it moves to the right. */}
        <div className="flex flex-col items-center gap-6 md:order-2">
          <p className="md:hidden">
            <Wordmark size="page" />
          </p>
          <div className={cardClass}>{children}</div>
        </div>
        <div className="flex flex-col gap-8 md:order-1">
          <p className="hidden md:block">
            <Wordmark size="page" />
          </p>
          <Promo />
        </div>
      </div>
    </main>
  );
}
