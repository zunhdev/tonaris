// Help's frame (DS-122, the creator's picks 2A and 5A): public and rendered on the server, in the app's dark look.
// A skip link first, then the header: the wordmark, which leads to the landing page, "Help", which leads to Help's
// home, and Sign in, or Open Tonaris once the browser learns the visitor is signed in (TON-185). On a computer the
// contents sit in a sidebar; on a phone a top bar opens them in a sheet. The footer names the terms.

import { useSignedIn } from "@/features/account/session";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button, buttonVariants } from "@tonaris/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@tonaris/ui/components/dialog";
import { Wordmark } from "@tonaris/ui/components/logo";

import { HelpNav } from "./help-nav";

export const helpContentId = "help-content";

function EntryLink() {
  const signedIn = useSignedIn();
  const className = buttonVariants({ variant: "primary", className: "h-9 px-3.5 max-md:h-11" });
  return signedIn ? (
    <Link to="/" className={className}>
      Open Tonaris
    </Link>
  ) : (
    <Link to="/sign-in" className={className}>
      Sign in
    </Link>
  );
}

/** The phone's contents, in a sheet from the bottom (DS-110's sheets). */
function PhoneContents({ current }: { current?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Contents"
        className="size-11 md:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden strokeWidth={1.5} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <DialogHeader>
            <DialogTitle>Contents</DialogTitle>
          </DialogHeader>
          <HelpNav current={current} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function HelpFrame({
  current,
  aside,
  contents = true,
  children,
}: {
  /** The page on view, which the contents mark and open to. */
  current?: string;
  /** What sits on the right on a wide screen: a page's On this page. */
  aside?: ReactNode;
  /** Whether the contents show beside the page on a computer; the home lists them itself (the creator's pick 1A). */
  contents?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-app text-body text-fg-secondary">
      <a
        href={`#${helpContentId}`}
        className="sr-only z-50 rounded-md bg-accent-fill px-3 py-2 text-fg-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-subtle bg-app/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[80rem] items-center gap-3 px-4 md:h-16 md:px-6">
          <Link to="/welcome" aria-label="Tonaris, what it is" className="rounded-md focus-ring">
            <Wordmark />
          </Link>
          <span aria-hidden className="h-5 w-px bg-subtle" />
          <Link
            to="/help"
            className="rounded-md text-brand font-medium text-fg-secondary focus-ring hover:text-fg-primary"
          >
            Help
          </Link>
          <span className="flex-1" />
          <PhoneContents current={current} />
          <span className="max-md:hidden">
            <EntryLink />
          </span>
        </div>
      </header>
      <div className="mx-auto flex max-w-[80rem]">
        {contents && (
          <aside className="sticky top-16 hidden max-h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-subtle py-6 pr-3 pl-4 md:block">
            <HelpNav current={current} />
          </aside>
        )}
        <div className="flex min-w-0 flex-1 gap-12 px-4 pt-8 pb-20 md:px-10 md:pt-10 xl:pr-6">
          <main id={helpContentId} tabIndex={-1} className="min-w-0 flex-1 outline-none">
            {children}
          </main>
          {aside}
        </div>
      </div>
      <footer className="border-t border-subtle">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-between gap-4 px-4 py-6 text-small text-fg-tertiary md:px-6">
          <Wordmark className="text-fg-secondary" />
          <p className="flex gap-3">
            <Link to="/terms" className="hover:text-fg-primary">
              Terms
            </Link>
            <span aria-hidden>·</span>
            <Link to="/privacy" className="hover:text-fg-primary">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
