// Tonaris's temporary identity (TON-114, DS-11): the mark, a record sliding out of its sleeve, and the wordmark, the
// mark beside the name. The permanent logo replaces the shapes here and in apps/web/public/favicon.svg, whose PNGs
// apps/web/scripts/render-icons.mjs renders again.

import { cn } from "@tonaris/ui/lib/utils";

/** The mark, in the current color. Decorative: the name always goes with it. */
function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="4.375 3.75 24.5 24.5"
      fill="currentColor"
      aria-hidden
      focusable="false"
      data-slot="logo"
      className={cn("size-5 shrink-0", className)}
    >
      <rect x="4.5" y="6.25" width="14" height="19.5" rx="2.25" />
      <path d="M20.25 6.7805A9.25 9.25 0 0 1 20.25 25.2195L20.25 18.1213A2.25 2.25 0 0 0 20.25 13.8787Z" />
    </svg>
  );
}

/** The mark and the name: `brand` in the sidebar and on guest pages, `page` above the sign-in card. */
function Wordmark({ size = "brand", className }: { size?: "brand" | "page"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-fg-primary",
        size === "page" ? "text-page" : "text-brand",
        className,
      )}
    >
      <Logo className={size === "page" ? "size-7" : "size-5"} />
      Tonaris
    </span>
  );
}

export { Wordmark };
