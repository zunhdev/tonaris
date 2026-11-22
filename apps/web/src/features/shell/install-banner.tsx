// The Home Screen banner (DS-123, section 2.2, TON-323): on an iPhone or iPad, in a browser rather than the installed
// app, a bar at the bottom of the landing page and the workspace suggests adding Tonaris to the Home Screen. No page
// can open iOS's Add to Home Screen itself, so Install shows the steps; in an app's built-in browser, which has none,
// it says to open Tonaris in Safari and copies the link. × closes the banner for good on the device. While it shows,
// the page ends above it (`data-install-banner` in globals.css), so it covers nothing.

import { useNarrowScreen } from "@/common/media";
import {
  Check,
  Copy,
  FileSearch,
  PenLine,
  Share,
  SquarePlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@tonaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tonaris/ui/components/dialog";
import { Input } from "@tonaris/ui/components/input";
import { cn } from "@tonaris/ui/lib/utils";

import { closeBanner, useHomeScreenOffer, type HomeScreenOffer } from "./install";

/** The banner, where it shows (DS-123); `signedIn` adds that the installed app asks to sign in once more. */
export function InstallBanner({ signedIn }: { signedIn: boolean }) {
  const offer = useHomeScreenOffer();
  const [open, setOpen] = useState(false);
  if (!offer) return null;
  return (
    <>
      <aside
        aria-label="Install Tonaris"
        data-install-banner=""
        className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-[26rem] animate-in items-center gap-3 rounded-2xl border border-subtle bg-raised py-2 pr-1 pl-3 shadow-floating duration-200 ease-enter fade-in-0 motion-safe:slide-in-from-bottom-4"
      >
        <img
          src="/apple-touch-icon.png"
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-[10px]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-fg-primary">Install Tonaris</p>
          <p className="text-small text-fg-secondary">
            Open it from your Home Screen, like an app.
          </p>
        </div>
        <Button variant="primary" className="h-11 px-4" onClick={() => setOpen(true)}>
          Install
        </Button>
        <Button variant="ghost" aria-label="Close" className="size-11 px-0" onClick={closeBanner}>
          <X aria-hidden strokeWidth={1.5} className="size-5" />
        </Button>
      </aside>
      <InstallSheet offer={offer} signedIn={signedIn} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Install's sheet: a bottom sheet on a phone (DS-110), a dialog on an iPad. */
function InstallSheet({
  offer,
  signedIn,
  open,
  onOpenChange,
}: {
  offer: HomeScreenOffer;
  signedIn: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const narrow = useNarrowScreen();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          narrow &&
            "top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        {offer === "steps" ? <Steps signedIn={signedIn} /> : <ToSafari />}
      </DialogContent>
    </Dialog>
  );
}

function Steps({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Install Tonaris</DialogTitle>
        <DialogDescription>
          Add it to your Home Screen, and it opens full screen, like an app.
        </DialogDescription>
      </DialogHeader>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-base text-fg-primary marker:text-fg-tertiary">
        <li>
          Tap <strong className="font-medium">Share</strong>{" "}
          <Share aria-hidden strokeWidth={1.5} className="inline size-4 align-[-2px]" />. If you
          don't see it, tap <strong className="font-medium">⋯</strong> beside the address first.
        </li>
        <li>
          Tap <strong className="font-medium">Add to Home Screen</strong>.
          <MenuPicture />
        </li>
        <li>
          Leave <strong className="font-medium">Open as Web App</strong> on, and tap{" "}
          <strong className="font-medium">Add</strong>.
        </li>
      </ol>
      {signedIn && (
        <p className="text-small text-fg-secondary">
          The installed app has its own sign-in, so you'll sign in once more there.
        </p>
      )}
      {/* An app showing pages in Safari's own view can't be told from Safari, and has no Add to Home Screen. */}
      <div className="flex flex-col gap-2 border-t border-subtle pt-4">
        <p className="text-small text-fg-secondary">
          No Add to Home Screen? Copy the link and open it in Safari.
        </p>
        <CopyLink variant="secondary" />
      </div>
    </>
  );
}

function ToSafari() {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Open Tonaris in Safari</DialogTitle>
        <DialogDescription>
          This app's browser can't add Tonaris to your Home Screen. Copy the link, open it in
          Safari, and tap Install there.
        </DialogDescription>
      </DialogHeader>
      <CopyLink variant="primary" />
      <p className="text-small text-fg-secondary">
        Or look for Open in Safari, or Open in browser, in this app's ⋯ menu.
      </p>
    </>
  );
}

/** Copies the page's address; when the browser won't, shows it to copy by hand. */
function CopyLink({ variant }: { variant: "primary" | "secondary" }) {
  const [state, setState] = useState<"idle" | "copied" | "refused">("idle");
  const href = typeof window === "undefined" ? "" : window.location.href;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setState("copied");
    } catch {
      setState("refused");
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Button variant={variant} className="h-11 w-full" onClick={() => void copy()}>
        {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {state === "copied" ? "Link copied" : "Copy link"}
      </Button>
      <p aria-live="polite" className="sr-only">
        {state === "copied" ? "Link copied." : ""}
      </p>
      {state === "refused" && (
        <>
          <p className="text-small text-fg-secondary">
            Couldn't copy it. Select the address, and copy it from there:
          </p>
          <Input
            readOnly
            value={href}
            aria-label="Tonaris's address"
            onFocus={(event) => event.currentTarget.select()}
          />
        </>
      )}
    </div>
  );
}

/** A picture of the Share menu's row, between its neighbours, blurred. */
function MenuPicture() {
  return (
    <div
      aria-hidden
      className="mt-3 flex flex-col gap-0.5 rounded-xl border border-subtle bg-app p-1.5 select-none"
    >
      <MenuRow icon={FileSearch} quiet>
        Find on Page
      </MenuRow>
      <MenuRow icon={SquarePlus}>Add to Home Screen</MenuRow>
      <MenuRow icon={PenLine} quiet>
        Markup
      </MenuRow>
    </div>
  );
}

function MenuRow({
  icon: Icon,
  quiet = false,
  children,
}: {
  icon: LucideIcon;
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center justify-between rounded-lg px-3",
        quiet
          ? "text-fg-tertiary blur-[1.5px]"
          : "bg-accent-fill font-medium text-fg-on-accent shadow-floating",
      )}
    >
      {children}
      <Icon strokeWidth={1.5} className="size-5" />
    </div>
  );
}
