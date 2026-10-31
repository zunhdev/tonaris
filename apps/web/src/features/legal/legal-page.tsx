// The frame of `/terms` and `/privacy` (TON-131): the wordmark, the text at a reading width, and the way to the other
// text and back to Tonaris. Public and server-rendered, so they read the same signed in or not; the support address
// comes from the API's `SUPPORT_EMAIL`, as on `/help/recovery`.

import { createApiClient } from "@/api";
import { serverApiUrl } from "@/config";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Wordmark } from "@tonaris/ui/components/logo";

import { Updated } from "./texts";

const linkClass = "text-fg-secondary underline underline-offset-2 hover:text-fg-primary";

/** The support address the texts name, or undefined when the API can't be asked. */
export async function loadSupport(): Promise<{ support: string | undefined }> {
  try {
    const { data } = await createApiClient(serverApiUrl).v1.support.get();
    return { support: data?.email };
  } catch {
    return { support: undefined };
  }
}

/** "Terms · Privacy", under the sign-in card, on shared pages and on the agreement screen. */
export function LegalLinks() {
  return (
    <p className="text-small text-fg-secondary">
      <Link to="/terms" className={linkClass}>
        Terms
      </Link>
      {" · "}
      <Link to="/privacy" className={linkClass}>
        Privacy
      </Link>
    </p>
  );
}

export function LegalPage({
  title,
  other,
  children,
}: {
  title: string;
  other: { to: "/terms" | "/privacy"; label: string };
  children: ReactNode;
}) {
  return (
    <main
      aria-labelledby="legal-title"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6"
    >
      <p>
        <Wordmark size="page" />
      </p>
      <article className="flex flex-col gap-5 text-fg-secondary">
        <div className="flex flex-col gap-1">
          <h1 id="legal-title" className="text-display text-fg-primary">
            {title}
          </h1>
          <Updated />
        </div>
        {children}
      </article>
      <footer className="flex gap-4 border-t border-subtle pt-4 text-small">
        <Link to={other.to} className={linkClass}>
          {other.label}
        </Link>
        <Link to="/" className={linkClass}>
          Back to Tonaris
        </Link>
      </footer>
    </main>
  );
}
