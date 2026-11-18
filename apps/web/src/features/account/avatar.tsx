// The account's avatar (DS-31, TON-169): the name's first letter, white, on a round ground whose hue the person chose
// (TON-296, FR-11.16), or else comes from a hash of the name, as a cover's letter tile does (DS-23). Brighter than a
// tile, and dark enough that the white letter keeps 4.5:1 at every hue (4.68:1 at the weakest, teal). Painted through
// the DOM, not a style attribute, which the CSP refuses in server-rendered HTML (TON-126).

import { firstMark, fnv1a } from "@/features/collection/artwork-tile";
import { useCallback } from "react";

import { cn } from "@tonaris/ui/lib/utils";

/** The avatar's hue: the one chosen, or Automatic's from the name (DS-31). */
export function hueOf(name: string, avatarHue: number | null = null): number {
  return avatarHue ?? fnv1a(name.trim()) % 360;
}

export function avatarOf(
  name: string,
  avatarHue: number | null = null,
): { letter: string; background: string } {
  const trimmed = name.trim();
  return {
    letter: firstMark(trimmed).toLocaleUpperCase(),
    background: `oklch(0.52 0.12 ${hueOf(trimmed, avatarHue)})`,
  };
}

/** The avatar, its size from `className`; decorative, as the name is beside it or in its button's name. */
export function Avatar({
  name,
  hue = null,
  className,
}: {
  name: string;
  /** The person's chosen hue (FR-11.16); null or none for Automatic. */
  hue?: number | null;
  className?: string;
}) {
  const { letter, background } = avatarOf(name, hue);
  const paint = useCallback(
    (element: HTMLSpanElement | null) => {
      if (element) element.style.background = background;
    },
    [background],
  );
  return (
    // The letter is generated content, not text: as text it would join the button's visible label, which then no
    // longer matches its accessible name, "Account: …" (axe's label-content-name-mismatch).
    <span
      ref={paint}
      aria-hidden
      data-slot="avatar"
      data-letter={letter}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-raised font-semibold text-fg-on-accent before:content-[attr(data-letter)]",
        className,
      )}
    />
  );
}
