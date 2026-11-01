// Tonaris's logo (TON-154, DS-19): the mark, a disc on a compact CD player, and the wordmark, the mark beside the name.
// The same shapes are in apps/web/public/favicon.svg and icon-maskable.svg, whose PNGs
// apps/web/scripts/render-icons.mjs renders.

import { cn } from "@tonaris/ui/lib/utils";

/**
 * The mark, in the current color, sized by its height. Decorative: the name always goes with it. On a 22.5 × 16 grid:
 * a 16-unit body with the disc, as tall as the body, in front of it, a 1.75-unit gap between them, and the spindle in
 * the disc's hole.
 */
function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 22.5 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      data-slot="logo"
      className={cn("aspect-[45/32] h-4 w-auto shrink-0", className)}
    >
      <path d="M7.905 16L2.5 16A2.5 2.5 0 0 1 0 13.5L0 2.5A2.5 2.5 0 0 1 2.5 0L7.905 0A0.35 0.35 0 0 1 8.134 0.615A9.75 9.75 0 0 0 8.134 15.385A0.35 0.35 0 0 1 7.905 16Z" />
      <path
        fillRule="evenodd"
        d="M6.5 8a8 8 0 1 0 16 0a8 8 0 1 0-16 0ZM11.75 8a2.75 2.75 0 1 0 5.5 0a2.75 2.75 0 1 0-5.5 0ZM13.25 8a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0Z"
      />
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
      <Logo className={size === "page" ? "h-5.5" : "h-4"} />
      Tonaris
    </span>
  );
}

export { Logo, Wordmark };
